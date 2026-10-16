// Developer activity collection retired. Compatibility shim for cached game builds.
(function(){
  'use strict';
  try{localStorage.removeItem('kryntic.activity.visitor.v1');localStorage.removeItem('kryntic.activity.disabled.v1');for(const game of ['word-havoc','brain-attack'])sessionStorage.removeItem('kryntic.activity.session.'+game)}catch(e){}
  window.KrynticActivity=Object.freeze({start(){},finish(){},reset(){}});
})();
