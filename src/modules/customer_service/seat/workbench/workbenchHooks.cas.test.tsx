import '../../../../test/setupDom'
import { afterEach, expect, it, mock, spyOn } from 'bun:test'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { SeatApiClient } from '../seatApiClient'
import { SeatApiError } from '../errors'
import { useSeatAuthStore } from '../seatAuthStore'
import { SeatWorkbenchApi } from './workbenchApi'
import { SeatWorkbenchProvider, useSeatClaim, useSeatTransfer, useSeatClose } from './workbenchHooks'
const clients: QueryClient[] = []
function harness() {
 useSeatAuthStore.getState().setSession('1')
 const api = new SeatWorkbenchApi({ client: new SeatApiClient({ fetchImpl: mock(async () => { throw new Error('no transport') }) }) })
 const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); clients.push(qc)
 const gateway = { api, createStream: mock(() => { throw new Error('no SSE') }) }
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><SeatWorkbenchProvider gateway={gateway}>{children}</SeatWorkbenchProvider></QueryClientProvider>
 return { api, qc, wrapper }
}
function deferred() { let resolve!: () => void; let reject!: (_e: Error) => void; const promise = new Promise<void>((a,b) => { resolve=a; reject=b }); return { promise,resolve,reject } }
afterEach(() => { cleanup(); clients.splice(0).forEach(q => q.clear()); mock.restore(); useSeatAuthStore.getState().clearSession('logout') })
it('transfer pending and late conflict never cross organization/workspace/session', async () => {
 const {api,wrapper}=harness(); const gate=deferred(); spyOn(api,'transfer').mockImplementation(() => gate.promise)
 const view=renderHook(({org,ws,session}) => useSeatTransfer(org,session,ws),{wrapper,initialProps:{org:'1',ws:'2',session:'3'}})
 act(()=>view.result.current.mutate({toIdentityId:'8',expectedVersion:4}))
 await waitFor(()=>expect(view.result.current.isPending).toBe(true))
 act(()=>view.rerender({org:'9',ws:'10',session:'11'}))
 expect(view.result.current.isPending).toBe(false); expect(view.result.current.variables).toBeUndefined()
 await act(async()=>gate.reject(new SeatApiError('conflict','old conflict')))
 await waitFor(()=>expect(view.result.current.conflict).toBe(false)); expect(view.result.current.error).toBeNull()
})
it('stored close action refuses dispatch after scope switch and freezes original args', async()=>{
 const {api,wrapper}=harness(); const call=spyOn(api,'close').mockResolvedValue(undefined)
 const view=renderHook(({session})=>useSeatClose('1',session,'2'),{wrapper,initialProps:{session:'3'}})
 const old=view.result.current.mutateAsync; act(()=>view.rerender({session:'4'}))
 await expect(old({expectedVersion:7,reason:'finished'})).rejects.toThrow(); expect(call).not.toHaveBeenCalled()
 await act(async()=>view.result.current.mutateAsync({expectedVersion:9,reason:'done'}))
 expect(call.mock.calls[0]).toEqual(['1','4','2',{expectedVersion:9,reason:'done'}])
})
it('claim old 401 after new authentication cannot leak error or run callback',async()=>{
 const {api,wrapper}=harness();const gate=deferred();spyOn(api,'claim').mockImplementation(()=>gate.promise)
 const callback=mock(()=>{})
 const view=renderHook(()=>useSeatClaim('1','2'),{wrapper})
 act(()=>view.result.current.mutate({sessionId:'3',expectedVersion:4},{onError:callback}))
 await waitFor(()=>expect(view.result.current.isPending).toBe(true))
 act(()=>useSeatAuthStore.getState().setSession('9'))
 expect(view.result.current.isPending).toBe(false)
 await act(async()=>gate.reject(new SeatApiError('unauthorized','old 401')))
 expect(view.result.current.error).toBeNull();expect(callback).not.toHaveBeenCalled();expect(useSeatAuthStore.getState().userId).toBe('9')
})
it('same scope conflict refreshes authority and explicit retry runs safe callbacks',async()=>{
 const {api,wrapper,qc}=harness();const call=spyOn(api,'claim').mockRejectedValueOnce(new SeatApiError('conflict','CAS')).mockResolvedValue(undefined)
 qc.setQueryData(['seat-workbench','sessions','1','2','active','','all','1','8','x'],{})
 const callback=mock(()=>{});const view=renderHook(()=>useSeatClaim('1','2'),{wrapper})
 await act(async()=>{await view.result.current.mutateAsync({sessionId:'3',expectedVersion:4}).catch(()=>{})})
 await waitFor(()=>expect(view.result.current.conflict).toEqual({sessionId:'3'}));expect(view.result.current.isError).toBe(true)
 act(()=>view.result.current.clearConflict());expect(view.result.current.conflict).toBeNull()
 await act(async()=>view.result.current.mutateAsync({sessionId:'3',expectedVersion:5},{onSuccess:callback}))
 await waitFor(()=>expect(view.result.current.isSuccess).toBe(true));expect(callback).toHaveBeenCalledTimes(1);expect(call.mock.calls).toEqual([['1','3','2',4],['1','3','2',5]])
})
for (const action of ['claim', 'transfer', 'close'] as const) {
 for (const kind of ['unauthorized', 'conflict'] as const) {
  it(`${action} late ${kind} after scope and authentication change stays isolated`, async () => {
   const {api,wrapper}=harness();const gate=deferred();const call=spyOn(api,action).mockImplementation(()=>gate.promise)
   const view=renderHook(({org,ws,session})=>{
    const claim=useSeatClaim(org,ws);const transfer=useSeatTransfer(org,session,ws);const close=useSeatClose(org,session,ws)
    return action==='claim'?claim:action==='transfer'?transfer:close
   },{wrapper,initialProps:{org:'1',ws:'2',session:'3'}})
   const input={sessionId:'3',toIdentityId:'8',expectedVersion:4,reason:'finished'}
   const callback=mock(()=>{});act(()=>view.result.current.mutate(input,{onError:callback}))
   await waitFor(()=>expect(call).toHaveBeenCalledTimes(1))
   input.expectedVersion=99;input.toIdentityId='99'
   act(()=>{view.rerender({org:'9',ws:'10',session:'11'});useSeatAuthStore.getState().setSession('9')})
   expect(view.result.current.isPending).toBe(false);expect(view.result.current.variables).toBeUndefined()
   await act(async()=>gate.reject(new SeatApiError(kind,'late response')))
   expect(view.result.current.error).toBeNull();expect(view.result.current.data).toBeUndefined()
   expect(view.result.current.conflict).toBe(action==='claim'?null:false);expect(callback).not.toHaveBeenCalled()
   expect(useSeatAuthStore.getState().userId).toBe('9')
   expect(call.mock.calls[0]?.[0]).toBe('1');expect(call.mock.calls[0]?.[1]).toBe('3')
   if(action==='claim')expect(call.mock.calls[0]?.[3]).toBe(4)
   else expect(call.mock.calls[0]?.[3]).toMatchObject({expectedVersion:4,toIdentityId:'8'})
  })
 }
}
it('same-session double event sends exactly one CAS; failed first can explicitly retry', async () => {
 const {api,wrapper}=harness();const gate=deferred();const call=spyOn(api,'close').mockImplementationOnce(()=>gate.promise).mockResolvedValue(undefined)
 const view=renderHook(()=>useSeatClose('1','3','2'),{wrapper})
 let first!:Promise<void>;let second!:Promise<void>
 act(()=>{first=view.result.current.mutateAsync({expectedVersion:4});second=view.result.current.mutateAsync({expectedVersion:4})})
 const firstError=first.catch(e=>e)
 await act(async()=>{await expect(second).rejects.toThrow()});await waitFor(()=>expect(call).toHaveBeenCalledTimes(1))
 await act(async()=>{gate.reject(new SeatApiError('server','failed'));await firstError})
 await act(async()=>view.result.current.mutateAsync({expectedVersion:5}));expect(call).toHaveBeenCalledTimes(2)
})
it('claim locks actual session independently before React renders',async()=>{
 const {api,wrapper}=harness();const gate=deferred();const call=spyOn(api,'claim').mockImplementation(()=>gate.promise)
 const view=renderHook(()=>useSeatClaim('1','2'),{wrapper});let a!:Promise<string>;let b!:Promise<string>;let duplicate!:Promise<string>
 act(()=>{a=view.result.current.mutateAsync({sessionId:'3',expectedVersion:4});duplicate=view.result.current.mutateAsync({sessionId:'3',expectedVersion:4});b=view.result.current.mutateAsync({sessionId:'4',expectedVersion:6})})
 await act(async()=>{await expect(duplicate).rejects.toThrow()});await waitFor(()=>expect(call).toHaveBeenCalledTimes(2))
 await act(async()=>{gate.resolve();await Promise.all([a,b])});expect(call.mock.calls.map(c=>c[1])).toEqual(['3','4'])
})
it('old completion cannot release the new scope in-flight lock',async()=>{
 const {api,wrapper}=harness();const a=deferred();const b=deferred();const call=spyOn(api,'transfer').mockImplementationOnce(()=>a.promise).mockImplementationOnce(()=>b.promise)
 const view=renderHook(({org})=>useSeatTransfer(org,'3','2'),{wrapper,initialProps:{org:'1'}})
 let old!:Promise<void>;act(()=>{old=view.result.current.mutateAsync({toIdentityId:'8',expectedVersion:4})})
 await waitFor(()=>expect(call).toHaveBeenCalledTimes(1));act(()=>view.rerender({org:'9'}))
 let current!:Promise<void>;act(()=>{current=view.result.current.mutateAsync({toIdentityId:'9',expectedVersion:5})})
 await waitFor(()=>expect(call).toHaveBeenCalledTimes(2));await act(async()=>{a.resolve();await old})
 await act(async()=>{await expect(view.result.current.mutateAsync({toIdentityId:'10',expectedVersion:5})).rejects.toThrow()})
 expect(call).toHaveBeenCalledTimes(2);await act(async()=>{b.resolve();await current})
})
