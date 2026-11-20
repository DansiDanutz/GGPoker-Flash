import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function engine({muted=false,music=true,fail=false}={}){
 let calls=0;const values={'ggpoker.sound':muted?'0':'1','ggpoker.soundChannels':JSON.stringify({music})};
 class Audio {paused=true;volume=0;canPlayType(){return 'probably';} play(){calls++;if(fail)return Promise.reject(Error('NotAllowedError'));this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
 let source=fs.readFileSync(new URL('../src/lib/sound.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export const sound =','globalThis.sound =');
 const context=vm.createContext({Audio,localStorage:{getItem:k=>values[k]??null,setItem:(k,v)=>values[k]=v},savedVolume:()=>0.7,VOLUME_KEY:'volume',CHANNEL_VOLUMES_KEY:'mix',DEFAULT_CHANNEL_VOLUMES:{},LOBBY_MUSIC_BASE_VOLUME:0.045,subscribePrefs:()=>{},parseChannelVolumes:()=>({music:1}),mixedVolume:v=>v,lobbyMusicSrc:()=>'/music.ogg'});
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
 return {sound:context.sound,calls:()=>calls,allow:()=>{fail=false;}};
}
test('blocked startup retries on interaction and does not restart playing music',async()=>{
 const e=engine({fail:true});e.sound.startMusic();e.sound.unlock();assert.equal(e.calls(),1);await new Promise(r=>setImmediate(r));e.allow();e.sound.unlock();await new Promise(r=>setImmediate(r));assert.equal(e.calls(),2);assert.equal(e.sound.music.paused,false);e.sound.unlock();assert.equal(e.calls(),2);
});
test('startup and interaction respect saved master and music mute',()=>{
 for(const options of [{muted:true},{music:false}]){const e=engine(options);e.sound.startMusic();e.sound.unlock();assert.equal(e.calls(),0);}
});
test('repeated interaction can retry after a previous interaction was blocked',async()=>{
 const e=engine({fail:true});e.sound.unlock();await new Promise(r=>setImmediate(r));e.allow();e.sound.unlock();await new Promise(r=>setImmediate(r));assert.equal(e.calls(),2);assert.equal(e.sound.music.paused,false);
});
