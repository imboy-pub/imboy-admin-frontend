import { expect, test } from 'bun:test'
import { WidgetApiClient } from './widgetApi'
import { createWidgetController } from './controller'
const settle = async () => { for(let i=0;i<6;i++) await new Promise(resolve=>setTimeout(resolve,0)) }
function setup() {
  const pending: Array<(_response: Response)=>void> = []
  const api = new WidgetApiClient(async (path, init) => {
    if(path.endsWith('/bootstrap')) return new Promise(resolve=>{pending.push(resolve)})
    if(init?.method==='POST') return new Response(JSON.stringify({code:0,payload:{session_id:'20',status:'active'}}))
    return new Response(JSON.stringify({code:0,payload:[]}))
  })
  const controller = createWidgetController({api,storage:null,nowMs:()=>0,newId:()=> 'random',getSubjectKey:()=> 'random-key',fetchImpl:async()=>new Response(),io:{render:()=>{},postToHost:()=>{}},streamFactory:()=>({start:()=>{},stop:()=>{}})})
  const respond = (index:number, secret:string) => pending[index]!(new Response(JSON.stringify({code:0,payload:{installation_id:'11',public_widget_id:'11',contact_id:'12',secret,consent_version:'',branding:{display_name:'客服'},expires_at:1789600000000,reused:false}})))
  controller.handleHostMessage('https://local.example',true,{source:'imboy-cs-widget',type:'host-context',widgetId:'11',locale:'zh-CN',page:{origin:'https://local.example',path:'/'}})
  return {api,controller,respond}
}
test('reverse completed bootstrap cannot overwrite current session credential',async()=>{
  const h=setup(); h.controller.retryBootstrap(); h.respond(1,'new-token'); await settle()
  expect(h.api.currentToken()).toBe('new-token'); expect(h.controller.currentState().session?.id).toBe('20')
  h.respond(0,'old-token'); await settle()
  expect(h.api.currentToken()).toBe('new-token'); expect(h.controller.currentState().session?.id).toBe('20')
})
test('bootstrap pending at close cannot reinstall credential',async()=>{
  const h=setup(); h.controller.closeAndCleanup(); h.respond(0,'stale-token'); await settle()
  expect(h.api.currentToken()).toBeNull(); expect(h.controller.currentState().session).toBeNull()
})
