import { SQL } from "bun";

type Role = "host" | "guest";
type SocketData = {
  room: string;
  role: Role;
  playerId: string;
  connectedAt: number;
  accountId?: string;
  accountUsername?: string;
};
type Room = {
  host?: any;
  guest?: any;
  hostPlayerId?: string;
  guestPlayerId?: string;
  hostAccountId?: string;
  guestAccountId?: string;
  touched: number;
};

const rooms = new Map<string, Room>();
const MAX_MESSAGE_BYTES = 512_000;
const ROOM_RE = /^[A-Z2-9]{6}$/;
const PLAYER_RE = /^[A-Za-z0-9-]{8,96}$/;
const ID_RE = /^[A-Za-z0-9-]{0,96}$/;
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const REPORT_REASONS = new Set(["abusive_name","cheating","harassment","other"]);
const SESSION_DAYS = 90;
const sql = new SQL(Bun.env.DATABASE_URL!);

await sql`
  CREATE TABLE IF NOT EXISTS wh_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_norm TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS wh_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES wh_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS wh_stats (
    user_id TEXT PRIMARY KEY REFERENCES wh_users(id) ON DELETE CASCADE,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS wh_matches (
    match_key TEXT PRIMARY KEY,
    room TEXT NOT NULL,
    host_user_id TEXT,
    guest_user_id TEXT,
    winner_role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS wh_sessions_user_idx ON wh_sessions(user_id)`;
await sql`DELETE FROM wh_sessions WHERE expires_at <= NOW()`;

function send(ws:any, value:any){ try{ ws.send(JSON.stringify(value)); }catch{} }
function other(room:Room, role:Role){ return role === "host" ? room.guest : room.host; }
function otherPlayerId(room:Room, role:Role){ return role === "host" ? room.guestPlayerId : room.hostPlayerId; }
function cleanupRoom(code:string){
  const r=rooms.get(code); if(!r) return;
  if(!r.host && !r.guest) rooms.delete(code);
}
function json(value:any,status=200){
  return Response.json(value,{status,headers:corsHeaders});
}
function normalizeUsername(v:any){ return String(v||"").trim(); }
function tokenHash(token:string){ return new Bun.CryptoHasher("sha256").update(token).digest("hex"); }
function makeToken(){ return (crypto.randomUUID()+"."+crypto.randomUUID()).replace(/[^A-Za-z0-9.-]/g,""); }
function bearer(req:Request){
  const h=req.headers.get("authorization")||"";
  return h.toLowerCase().startsWith("bearer ")?h.slice(7).trim():"";
}
async function profileForToken(token:string){
  if(!token) return null;
  const hash=tokenHash(token);
  const rows=await sql`
    SELECT u.id,u.username,u.created_at,
           s.games,s.wins,s.losses,s.draws,s.streak,s.best_streak
    FROM wh_sessions sess
    JOIN wh_users u ON u.id=sess.user_id
    JOIN wh_stats s ON s.user_id=u.id
    WHERE sess.token_hash=${hash} AND sess.expires_at>NOW()
    LIMIT 1
  `;
  if(!rows.length) return null;
  const r:any=rows[0];
  return {
    id:String(r.id),username:String(r.username),createdAt:r.created_at,
    stats:{
      games:Number(r.games)||0,wins:Number(r.wins)||0,losses:Number(r.losses)||0,
      draws:Number(r.draws)||0,streak:Number(r.streak)||0,bestStreak:Number(r.best_streak)||0
    }
  };
}
async function issueSession(userId:string){
  const token=makeToken(),hash=tokenHash(token);
  await sql`
    INSERT INTO wh_sessions(token_hash,user_id,expires_at)
    VALUES(${hash},${userId},NOW()+INTERVAL '90 days')
  `;
  return token;
}
async function updateUserStats(userId:string,result:"win"|"loss"|"draw"){
  if(result==="win"){
    await sql`
      UPDATE wh_stats
      SET games=games+1,wins=wins+1,streak=streak+1,
          best_streak=GREATEST(best_streak,streak+1),updated_at=NOW()
      WHERE user_id=${userId}
    `;
  }else if(result==="loss"){
    await sql`
      UPDATE wh_stats
      SET games=games+1,losses=losses+1,streak=0,updated_at=NOW()
      WHERE user_id=${userId}
    `;
  }else{
    await sql`
      UPDATE wh_stats
      SET games=games+1,draws=draws+1,streak=0,updated_at=NOW()
      WHERE user_id=${userId}
    `;
  }
}

const corsHeaders = {
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers":"content-type,authorization",
  "cache-control":"no-store"
};

// First-party game activity. No account names, passwords, URLs, or IPs are stored.
await sql`
 CREATE TABLE IF NOT EXISTS kryntic_activity (
  id UUID PRIMARY KEY, game TEXT NOT NULL CHECK(game IN ('word-havoc','brain-attack')),
  visitor_id TEXT NOT NULL, session_id TEXT NOT NULL, event TEXT NOT NULL,
  mode TEXT NOT NULL, match_id UUID, active_seconds INTEGER NOT NULL DEFAULT 0,
  is_test BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;
await sql`CREATE INDEX IF NOT EXISTS kryntic_activity_time_idx ON kryntic_activity(created_at,game)`;
await sql`CREATE INDEX IF NOT EXISTS kryntic_activity_visitor_idx ON kryntic_activity(visitor_id,game,created_at)`;
const activityEvents = new Set(['page_view','play_click','match_start','match_complete','engagement','session_end']);
const activityModes = new Set(['menu','setup','cpu','local','online','battle','practice','daily','tutorial']);
const activityUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activityRates = new Map<string,{at:number,count:number}>();
let activityCleanupAt = 0;
async function activityRequest(req: Request, url: URL): Promise<Response|null> {
 if (!url.pathname.startsWith('/activity/')) return null;
 if (url.pathname === '/activity/events' && req.method === 'POST') {
  if (req.headers.get('origin') !== 'https://whatwhat689.github.io') return json({ok:false,error:'origin'},403);
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const bucket = tokenHash(ip), now = Date.now();
  if(activityRates.size>5000) for(const [key,value] of activityRates) if(now-value.at>60000) activityRates.delete(key);
  const rate=activityRates.get(bucket);
  if(rate&&now-rate.at<60000){if(rate.count>=180)return json({ok:false,error:'rate_limit'},429);rate.count++;}
  else activityRates.set(bucket,{at:now,count:1});
  if(Number(req.headers.get('content-length')||0)>16000)return json({ok:false,error:'too_large'},413);
  const text=await req.text(); if(text.length>16000)return json({ok:false,error:'too_large'},413);
  let body:any;try{body=JSON.parse(text)}catch{return json({ok:false,error:'invalid_json'},400)}
  if(!Array.isArray(body.events)||body.events.length<1||body.events.length>12)return json({ok:false,error:'invalid_batch'},400);
  for(const e of body.events){
   if(!e||!activityUuid.test(e.id)||!activityUuid.test(e.visitor)||!activityUuid.test(e.session)||!['word-havoc','brain-attack'].includes(e.game)||!activityEvents.has(e.event)||!activityModes.has(e.mode)||(e.match!==null&&!activityUuid.test(e.match))||!Number.isInteger(e.seconds)||e.seconds<0||e.seconds>43200||typeof e.test!=='boolean')return json({ok:false,error:'invalid_event'},400);
  }
  for(const e of body.events){
   await sql`INSERT INTO kryntic_activity(id,game,visitor_id,session_id,event,mode,match_id,active_seconds,is_test)
    VALUES(${e.id},${e.game},${tokenHash(e.visitor)},${tokenHash(e.session)},${e.event},${e.mode},${e.match},${e.seconds},${e.test}) ON CONFLICT(id) DO NOTHING`;
  }
  if(now-activityCleanupAt>86400000){activityCleanupAt=now;await sql`DELETE FROM kryntic_activity WHERE created_at < NOW()-INTERVAL '90 days'`;}
  return json({ok:true,accepted:body.events.length});
 }
 if(url.pathname==='/activity/summary'&&req.method==='GET'){
  const key=Bun.env.KRYNTIC_ACTIVITY_READ_KEY||'';
  if(!key||tokenHash(bearer(req))!==tokenHash(key))return json({ok:false,error:'unauthorized'},401);
  const days=Math.min(90,Math.max(1,Number(url.searchParams.get('days'))||7));
  const test=url.searchParams.get('test')==='1';
  const rows=await sql`
   WITH selected AS (SELECT * FROM kryntic_activity WHERE is_test=${test} AND created_at>=NOW()-(${days}::int * INTERVAL '1 day')),
   sessions AS (SELECT game,session_id,MAX(active_seconds) AS seconds FROM selected GROUP BY game,session_id),
   starts AS (SELECT DISTINCT game,match_id FROM selected WHERE event='match_start'),
   completions AS (SELECT DISTINCT s.game,s.match_id FROM starts s JOIN kryntic_activity c ON c.game=s.game AND c.match_id=s.match_id AND c.event='match_complete' AND c.is_test=${test}),
   returning_browsers AS (SELECT DISTINCT s.game,s.visitor_id FROM selected s WHERE s.event='page_view' AND EXISTS(SELECT 1 FROM kryntic_activity p WHERE p.game=s.game AND p.visitor_id=s.visitor_id AND p.event='page_view' AND p.is_test=${test} AND p.created_at<s.created_at-INTERVAL '30 minutes'))
   SELECT g.game,
    (SELECT COUNT(DISTINCT session_id) FROM selected s WHERE s.game=g.game AND event='page_view') AS visits,
    (SELECT COUNT(DISTINCT visitor_id) FROM selected s WHERE s.game=g.game AND event='page_view') AS visitors,
    (SELECT COUNT(*) FROM selected s WHERE s.game=g.game AND event='page_view') AS page_views,
    (SELECT COUNT(*) FROM selected s WHERE s.game=g.game AND event='play_click') AS play_clicks,
    (SELECT COUNT(DISTINCT session_id) FROM selected s WHERE s.game=g.game AND event='match_start') AS playing_sessions,
    (SELECT COUNT(*) FROM starts s WHERE s.game=g.game) AS match_starts,
    (SELECT COUNT(*) FROM completions c WHERE c.game=g.game) AS match_completions,
    (SELECT COUNT(*) FROM returning_browsers r WHERE r.game=g.game) AS returning_visitors,
    COALESCE((SELECT SUM(seconds) FROM sessions s WHERE s.game=g.game),0) AS active_seconds,
    (SELECT COUNT(DISTINCT session_id) FROM selected s WHERE s.game=g.game AND created_at>=NOW()-INTERVAL '5 minutes') AS active_recently,
    (SELECT MAX(created_at) FROM selected s WHERE s.game=g.game) AS last_event
   FROM (VALUES ('word-havoc'),('brain-attack')) AS g(game)`;
  const daily=await sql`SELECT (created_at AT TIME ZONE 'America/New_York')::date AS day,game,
   COUNT(DISTINCT session_id) FILTER(WHERE event='page_view') AS visits,
   COUNT(DISTINCT match_id) FILTER(WHERE event='match_start') AS starts,
   COUNT(DISTINCT match_id) FILTER(WHERE event='match_complete') AS completions
   FROM kryntic_activity WHERE is_test=${test} AND created_at>=NOW()-(${days}::int*INTERVAL '1 day') GROUP BY 1,2 ORDER BY 1 DESC,2`;
  const modes=await sql`SELECT game,mode,COUNT(DISTINCT match_id) AS starts FROM kryntic_activity WHERE is_test=${test} AND event='match_start' AND created_at>=NOW()-(${days}::int*INTERVAL '1 day') GROUP BY game,mode ORDER BY starts DESC`;
  const since=await sql`SELECT MIN(created_at) AS since FROM kryntic_activity`;
  return json(JSON.parse(JSON.stringify({ok:true,days,test,generated_at:new Date().toISOString(),since:since[0]?.since||null,games:rows,daily,modes},(_,value)=>typeof value==='bigint'?Number(value):value)));
 }
 return json({ok:false,error:'not_found'},404);
}

Bun.serve<SocketData>({
  port: Number(Bun.env.PORT || 3000),
  async fetch(req, srv){
    const url = new URL(req.url);
    const activity = req.method === 'OPTIONS' ? null : await activityRequest(req, url); if (activity) return activity;
    if(req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});

    if(url.pathname === "/health"){
      let connected=0;
      for(const r of rooms.values()) connected += (r.host?1:0)+(r.guest?1:0);
      let db=true;
      try{ await sql`SELECT 1`; }catch{ db=false; }
      return json({ok:db,service:"word-havoc-relay",rooms:rooms.size,connections:connected,database:db},db?200:503);
    }

    if(url.pathname==="/auth/register" && req.method==="POST"){
      let body:any; try{body=await req.json();}catch{return json({ok:false,error:"invalid_json"},400);}
      const username=normalizeUsername(body?.username),norm=username.toLowerCase(),password=String(body?.password||"");
      if(!USER_RE.test(username)) return json({ok:false,error:"username_invalid"},400);
      if(password.length<8||password.length>72) return json({ok:false,error:"password_invalid"},400);
      const existing=await sql`SELECT 1 FROM wh_users WHERE username_norm=${norm} LIMIT 1`;
      if(existing.length) return json({ok:false,error:"username_taken"},409);
      const id=crypto.randomUUID();
      const passwordHash=await Bun.password.hash(password,{algorithm:"argon2id"});
      try{
        await sql`INSERT INTO wh_users(id,username,username_norm,password_hash) VALUES(${id},${username},${norm},${passwordHash})`;
      }catch(e:any){
        if(String(e?.code||"")==="23505") return json({ok:false,error:"username_taken"},409);
        throw e;
      }
      await sql`INSERT INTO wh_stats(user_id) VALUES(${id})`;
      const token=await issueSession(id);
      const profile=await profileForToken(token);
      return json({ok:true,token,profile});
    }

    if(url.pathname==="/auth/login" && req.method==="POST"){
      let body:any; try{body=await req.json();}catch{return json({ok:false,error:"invalid_json"},400);}
      const username=normalizeUsername(body?.username),norm=username.toLowerCase(),password=String(body?.password||"");
      const rows=await sql`SELECT id,password_hash FROM wh_users WHERE username_norm=${norm} LIMIT 1`;
      if(!rows.length) return json({ok:false,error:"invalid_login"},401);
      const row:any=rows[0];
      const valid=await Bun.password.verify(password,String(row.password_hash));
      if(!valid) return json({ok:false,error:"invalid_login"},401);
      const token=await issueSession(String(row.id));
      const profile=await profileForToken(token);
      return json({ok:true,token,profile});
    }

    if(url.pathname==="/auth/me" && req.method==="GET"){
      const profile=await profileForToken(bearer(req));
      return profile?json({ok:true,profile}):json({ok:false,error:"unauthorized"},401);
    }

    if(url.pathname==="/auth/logout" && req.method==="POST"){
      const token=bearer(req); if(!token) return json({ok:true});
      await sql`DELETE FROM wh_sessions WHERE token_hash=${tokenHash(token)}`;
      return json({ok:true});
    }

    if(url.pathname==="/auth/delete" && req.method==="DELETE"){
      const token=bearer(req);
      const profile=await profileForToken(token);
      if(!profile) return json({ok:false,error:"unauthorized"},401);
      let body:any; try{body=await req.json();}catch{body={};}
      const password=String(body?.password||"");
      const rows=await sql`SELECT password_hash FROM wh_users WHERE id=${profile.id} LIMIT 1`;
      if(!rows.length || !(await Bun.password.verify(password,String((rows[0] as any).password_hash)))){
        return json({ok:false,error:"password_required"},401);
      }
      await sql`DELETE FROM wh_users WHERE id=${profile.id}`;
      return json({ok:true});
    }

    if(url.pathname==="/stats/match" && req.method==="POST"){
      const profile=await profileForToken(bearer(req));
      if(!profile) return json({ok:false,error:"unauthorized"},401);
      let body:any; try{body=await req.json();}catch{return json({ok:false,error:"invalid_json"},400);}
      const room=String(body?.room||"").toUpperCase();
      const matchId=String(body?.matchId||"").replace(/[^A-Za-z0-9-]/g,"").slice(0,96);
      const winner=String(body?.winner||"");
      if(!ROOM_RE.test(room)||matchId.length<8||!["host","guest","draw"].includes(winner)) return json({ok:false,error:"invalid_match"},400);
      const r=rooms.get(room);
      if(!r || r.hostAccountId!==profile.id) return json({ok:false,error:"not_host"},403);
      const matchKey=room+":"+matchId;
      const inserted=await sql`
        INSERT INTO wh_matches(match_key,room,host_user_id,guest_user_id,winner_role)
        VALUES(${matchKey},${room},${r.hostAccountId||null},${r.guestAccountId||null},${winner})
        ON CONFLICT(match_key) DO NOTHING
        RETURNING match_key
      `;
      if(!inserted.length) return json({ok:true,duplicate:true});
      if(r.hostAccountId) await updateUserStats(r.hostAccountId,winner==="draw"?"draw":winner==="host"?"win":"loss");
      if(r.guestAccountId) await updateUserStats(r.guestAccountId,winner==="draw"?"draw":winner==="guest"?"win":"loss");
      return json({ok:true});
    }

    if(url.pathname === "/report" && req.method === "POST"){
      const len = Number(req.headers.get("content-length") || 0);
      if(len > 4096) return json({ok:false,error:"too_large"},413);
      let body:any; try{ body = await req.json(); }catch{ return json({ok:false,error:"invalid_json"},400); }
      const room=String(body?.room||"").toUpperCase().slice(0,6);
      const reporterId=String(body?.reporterId||"").slice(0,96);
      const reportedId=String(body?.reportedId||"").slice(0,96);
      const reason=String(body?.reason||"other");
      const version=String(body?.version||"").slice(0,24);
      if(!ROOM_RE.test(room)||!ID_RE.test(reporterId)||!ID_RE.test(reportedId)||!REPORT_REASONS.has(reason)) return json({ok:false,error:"invalid_report"},400);
      console.log(JSON.stringify({type:"WORD_HAVOC_REPORT",at:new Date().toISOString(),room,reporterId,reportedId,reason,version}));
      return json({ok:true});
    }

    if(url.pathname !== "/ws") return new Response("Word Havoc relay", {status:200,headers:{"cache-control":"no-store"}});
    const room = (url.searchParams.get("room") || "").toUpperCase();
    const role = url.searchParams.get("role") as Role;
    const playerId = String(url.searchParams.get("player") || "");
    if(!ROOM_RE.test(room) || (role !== "host" && role !== "guest") || !PLAYER_RE.test(playerId)){
      return new Response("Invalid room, role, or player", {status:400});
    }
    const ok = srv.upgrade(req,{data:{room,role,playerId,connectedAt:Date.now()}});
    return ok ? undefined : new Response("WebSocket upgrade failed",{status:400});
  },
  websocket:{
    maxPayloadLength: MAX_MESSAGE_BYTES,
    idleTimeout: 180,
    open(ws){
      const {room,role,playerId}=ws.data;
      let r=rooms.get(room);
      if(!r){r={touched:Date.now()};rooms.set(room,r);}
      if(role==="host"){
        if(r.hostPlayerId && r.hostPlayerId!==playerId && r.guest){ send(ws,{type:"relayError",code:"ROOM_IN_USE"}); ws.close(4001,"Room belongs to another host"); return; }
        if(r.host && r.host!==ws){
          if(r.hostPlayerId===playerId){ try{ r.host.close(4000,"Reconnected elsewhere"); }catch{} }
          else{ send(ws,{type:"relayError",code:"ROOM_IN_USE"}); ws.close(4001,"Room already has a host"); return; }
        }
        r.host=ws; r.hostPlayerId=playerId;
      }else{
        if(!r.host){ send(ws,{type:"relayError",code:"HOST_NOT_FOUND"}); ws.close(4004,"Host not found"); return; }
        if(r.guestPlayerId && r.guestPlayerId!==playerId && r.host){ send(ws,{type:"relayError",code:"ROOM_FULL"}); ws.close(4002,"Guest slot is reserved"); return; }
        if(r.guest && r.guest!==ws){
          if(r.guestPlayerId===playerId){ try{ r.guest.close(4000,"Reconnected elsewhere"); }catch{} }
          else{ send(ws,{type:"relayError",code:"ROOM_FULL"}); ws.close(4002,"Room is full"); return; }
        }
        r.guest=ws; r.guestPlayerId=playerId;
      }
      r.touched=Date.now();
      send(ws,{type:"relayReady",role,room,peerPlayerId:otherPlayerId(r,role)||""});
      const peer=other(r,role);
      if(peer) send(peer,{type:"relayPeerConnected",role,playerId});
    },
    async message(ws,message){
      const {room,role}=ws.data;
      const r=rooms.get(room); if(!r) return;
      r.touched=Date.now();
      const text = typeof message === "string" ? message : new TextDecoder().decode(message as Uint8Array);
      if(text.length > MAX_MESSAGE_BYTES){ ws.close(1009,"Message too large"); return; }
      let parsed:any;
      try{ parsed=JSON.parse(text); }catch{ return; }
      if(!parsed || typeof parsed!=="object") return;

      if(parsed.type==="heartbeat"){ send(ws,{type:"heartbeatAck",at:Date.now()}); return; }

      if(parsed.type==="authenticate"){
        const profile=await profileForToken(String(parsed.token||""));
        if(!profile){ send(ws,{type:"authError"}); return; }
        ws.data.accountId=profile.id;
        ws.data.accountUsername=profile.username;
        if(role==="host") r.hostAccountId=profile.id; else r.guestAccountId=profile.id;
        send(ws,{type:"authReady",profile});
        const peer=other(r,role);
        if(peer) send(peer,{type:"peerProfile",role,username:profile.username});
        return;
      }

      if(!ws.data.accountId){ send(ws,{type:"authError"}); return; }
      const peer=other(r,role);
      if(!peer){ send(ws,{type:"relayWaiting"}); return; }
      send(peer,parsed);
    },
    close(ws){
      const {room,role}=ws.data;
      const r=rooms.get(room); if(!r) return;
      if(role==="host" && r.host===ws) r.host=undefined;
      if(role==="guest" && r.guest===ws) r.guest=undefined;
      r.touched=Date.now();
      const peer=other(r,role);
      if(peer) send(peer,{type:"relayPeerClosed",role});
      cleanupRoom(room);
    }
  }
});