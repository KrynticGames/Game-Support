type Role = "host" | "guest";
type SocketData = {
  room: string;
  role: Role;
  playerId: string;
  connectedAt: number;
  queued?: boolean;
  publicMatch?: boolean;
};
type Room = {
  host?: any;
  guest?: any;
  hostPlayerId?: string;
  guestPlayerId?: string;
  publicMatch?: boolean;
  disconnectedAt?: number;
  touched: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
};

const rooms = new Map<string, Room>();
const waiting = new Set<any>();
function assignPublic(ws:any, peer:any){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code='';
  do{code=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>chars[n%chars.length]).join('');}while(rooms.has(code));
  const r:Room={host:peer,guest:ws,hostPlayerId:peer.data.playerId,guestPlayerId:ws.data.playerId,publicMatch:true,touched:Date.now()};
  rooms.set(code,r);touchRoom(code,r);
  for(const [socket,role] of [[peer,'host'],[ws,'guest']] as const){socket.data.room=code;socket.data.role=role;socket.data.queued=false;socket.data.publicMatch=true;send(socket,{type:'matched',role,room:code});}
}
const MAX_MESSAGE_BYTES = 512_000;
const ROOM_RE = /^[A-Z2-9]{6}$/;
const PLAYER_RE = /^[A-Za-z0-9-]{8,96}$/;
function send(ws:any, value:any){ try{ ws.send(JSON.stringify(value)); }catch{} }
function other(room:Room, role:Role){ return role === "host" ? room.guest : room.host; }
function otherPlayerId(room:Room, role:Role){ return role === "host" ? room.guestPlayerId : room.hostPlayerId; }
function cleanupRoom(code:string){
  const r=rooms.get(code); if(!r) return;
  if(!r.host && !r.guest){clearTimeout(r.expiryTimer);rooms.delete(code);}
}
function json(value:any,status=200){
  return Response.json(value,{status,headers:corsHeaders});
}
const corsHeaders = {
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"content-type",
  "cache-control":"no-store"
};

// Match routing exists only in process memory. No database, filesystem writes,
// analytics, account profiles, request-body logging or stored match history.
const ROOM_IDLE_MS = 15 * 60_000;
function touchRoom(code:string,r:Room){
  r.touched=Date.now();clearTimeout(r.expiryTimer);
  r.expiryTimer=setTimeout(()=>{
    if(rooms.get(code)!==r)return;
    rooms.delete(code);
    for(const socket of [r.host,r.guest])if(socket)socket.close(4004,'Match expired');
  },ROOM_IDLE_MS);
  r.expiryTimer.unref?.();
}

Bun.serve<SocketData>({
  port: Number(Bun.env.PORT || 3000),
  async fetch(req, srv){
    const url = new URL(req.url);
    if(req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});

    if(url.pathname === "/health"){
      let connected=0;
      for(const r of rooms.values()) connected += (r.host?1:0)+(r.guest?1:0);
      return json({ok:true,service:"word-havoc-relay",version:"memory-only-v1",rooms:rooms.size,connections:connected,persistence:"none",database:false});
    }

    // Reject legacy data collection without reading request bodies.
    if(url.pathname.startsWith('/auth/') || url.pathname.startsWith('/activity/') || url.pathname.startsWith('/stats/'))return json({ok:false,error:'feature_retired'},410);

    // Retired: do not accept or log reports that have no moderation workflow.
    if(url.pathname === '/report')return json({ok:false,error:'reports_unavailable'},410);

    if(url.pathname === '/match'){
      const playerId=String(url.searchParams.get('player')||'');
      if(!PLAYER_RE.test(playerId))return new Response('Invalid player',{status:400});
      if(waiting.size>=1000)return new Response('Queue busy',{status:503});
      const ok=srv.upgrade(req,{data:{room:'',role:'host',playerId,queued:true,connectedAt:Date.now()}});
      return ok?undefined:new Response('Upgrade failed',{status:400});
    }
    if(url.pathname !== "/ws") return new Response("Word Havoc relay", {status:200,headers:{"cache-control":"no-store"}});
    const room = (url.searchParams.get("room") || "").toUpperCase();
    const role = url.searchParams.get("role") as Role;
    const playerId = String(url.searchParams.get("player") || "");
    if(!ROOM_RE.test(room) || (role !== "host" && role !== "guest") || !PLAYER_RE.test(playerId)){
      return new Response("Invalid room, role, or player", {status:400});
    }
    // Direct room URLs are for reconnecting a slot created by matchmaking only.
    const existing=rooms.get(room);
    if(!existing || (role==='host'?existing.hostPlayerId:existing.guestPlayerId)!==playerId)return new Response('Match not found',{status:404});
    const ok = srv.upgrade(req,{data:{room,role,playerId,connectedAt:Date.now()}});
    return ok ? undefined : new Response("WebSocket upgrade failed",{status:400});
  },
  websocket:{
    maxPayloadLength: MAX_MESSAGE_BYTES,
    idleTimeout: 180,
    open(ws){
      if(ws.data.queued){
        for(const candidate of waiting){
          if(candidate.readyState!==1){waiting.delete(candidate);continue;}
          if(candidate.data.playerId===ws.data.playerId)continue;
          waiting.delete(candidate);assignPublic(ws,candidate);return;
        }
        waiting.add(ws);send(ws,{type:'queued'});return;
      }
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
      r.disconnectedAt=undefined;
      ws.data.publicMatch=!!r.publicMatch;
      touchRoom(room,r);
      send(ws,{type:"relayReady",role,room,peerPlayerId:otherPlayerId(r,role)||""});
      const peer=other(r,role);
      if(peer) send(peer,{type:"relayPeerConnected",role,playerId});
    },
    async message(ws,message){
      if(ws.data.queued){
        if(String(message).includes('heartbeat'))send(ws,{type:'heartbeatAck'});
        return;
      }
      const {room,role}=ws.data;
      const r=rooms.get(room); if(!r) return;
      const text = typeof message === "string" ? message : new TextDecoder().decode(message as Uint8Array);
      if(text.length > MAX_MESSAGE_BYTES){ ws.close(1009,"Message too large"); return; }
      let parsed:any;
      try{ parsed=JSON.parse(text); }catch{ return; }
      if(!parsed || typeof parsed!=="object") return;

      if(parsed.type==="heartbeat"){ send(ws,{type:"heartbeatAck",at:Date.now()}); return; }

      const peer=other(r,role);
      if(!peer){ send(ws,{type:"relayWaiting"}); return; }
      if(ws.data.publicMatch){
        const allowed=role==='host'?['welcome','state','rematchRequest','rematchAccept','blocked']:['join','action','rematchRequest','rematchAccept','blocked'];
        if(!allowed.includes(parsed.type))return;
        if(parsed.type==='join')parsed.playerId=ws.data.playerId;
      }
      touchRoom(room,r);
      send(peer,parsed);
    },
    close(ws){
      waiting.delete(ws);
      const {room,role}=ws.data;
      const r=rooms.get(room); if(!r) return;
      if(role==="host" && r.host===ws) r.host=undefined;
      if(role==="guest" && r.guest===ws) r.guest=undefined;
      if((role==='host'&&r.host)||(role==='guest'&&r.guest))return;
      touchRoom(room,r);
      const peer=other(r,role);
      if(peer) send(peer,{type:"relayPeerClosed",role});
      const disconnectedAt=Date.now();r.disconnectedAt=disconnectedAt;
      setTimeout(()=>{const current=rooms.get(room);if(current===r&&r.disconnectedAt===disconnectedAt&&(!r.host||!r.guest)){clearTimeout(r.expiryTimer);for(const socket of [r.host,r.guest])if(socket){send(socket,{type:'matchExpired'});socket.close(4004,'Opponent left');}rooms.delete(room);}},61000);
      cleanupRoom(room);
    }
  }
});