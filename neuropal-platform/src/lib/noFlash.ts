// Runs in <head> before first paint: re-applies the visitor's saved look
// (attributes + CSS variables pre-computed by the token logic) so a Classic
// or custom Signal look never flashes the default first. Whitelisted keys
// only; any storage error leaves the default look in place.
import { SKIN_ATTRIBUTES } from "./appearance";
import { APPEARANCE_CSS_KEY } from "./keys";

export const NO_FLASH_SCRIPT = `(function(){try{var d=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_CSS_KEY,
)})||"null");if(!d||typeof d!=="object")return;var r=document.documentElement,A=${JSON.stringify(
  SKIN_ATTRIBUTES,
)},a=d.attrs||{},v=d.vars||{},i,k;for(i=0;i<A.length;i++){if(typeof a[A[i]]==="string")r.setAttribute(A[i],a[A[i]])}for(k in v){if(k.indexOf("--np-")===0&&typeof v[k]==="string")r.style.setProperty(k,v[k])}}catch(e){}})();`;
