import { expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { observeReadVisibility } from './readVisibility'
import { createVisitorReads } from './visitorRead'

test('actual layout, foreground and focus gate; cleanup removes listeners', () => {
  const dom = new JSDOM('<div id="root"><div role="log"><div data-role="agent" data-message-id="2"></div><div data-role="visitor" data-message-id="3"></div><div data-role="agent" data-message-id="4"></div></div></div>', {pretendToBeVisual: true})
  const doc = dom.window.document; const root = doc.getElementById('root')!
  let focus = true; let visibility = 'visible'
  Object.defineProperty(doc, 'hasFocus', {value: () => focus})
  Object.defineProperty(doc, 'visibilityState', {get: () => visibility})
  const rect = (top: number, bottom: number) => ({top,bottom,left:0,right:100,width:100,height:bottom-top}) as DOMRect
  const log = root.querySelector<HTMLElement>('[role="log"]')!
  log.getBoundingClientRect = () => rect(0,100)
  for (const el of log.children) {
    const node = el as HTMLElement
    node.getBoundingClientRect = () => node.dataset.messageId === '4' ? rect(101,130) : rect(10,40)
    node.getClientRects = () => [node.getBoundingClientRect()] as unknown as DOMRectList
  }
  const calls: string[][] = []; const view = observeReadVisibility(root, ids => calls.push(ids))
  view.refresh()
  root.dispatchEvent(new dom.window.Event('scroll')); expect(calls.at(-1)).toEqual(['2'])
  focus = false; dom.window.dispatchEvent(new dom.window.Event('blur')); expect(calls.at(-1)).toEqual([])
  focus = true; visibility = 'hidden'; doc.dispatchEvent(new dom.window.Event('visibilitychange')); expect(calls.at(-1)).toEqual([])
  view.stop(); const count = calls.length
  root.dispatchEvent(new dom.window.Event('scroll')); expect(calls.length).toBe(count)
  dom.window.close()
})

test('visible modal prevents geometrically intersecting agent receipt; closing requires fresh layout', async () => {
  const dom = new JSDOM('<div id="root"><div role="log"><div data-role="agent" data-message-id="2"></div></div><div role="dialog" aria-modal="true" style="display:flex"></div></div>', {pretendToBeVisual:true})
  const doc = dom.window.document; const root = doc.getElementById('root')!
  Object.defineProperty(doc,'hasFocus',{value:()=>true})
  const rect = {top:0,bottom:100,left:0,right:100,width:100,height:100} as DOMRect
  root.querySelector<HTMLElement>('[role="log"]')!.getBoundingClientRect = () => rect
  const bubble = root.querySelector<HTMLElement>('[data-message-id]')!
  bubble.getBoundingClientRect = () => ({...rect,top:10,bottom:50,height:40})
  bubble.getClientRects = () => [bubble.getBoundingClientRect()] as unknown as DOMRectList
  const calls: string[][] = []
  const reads = createVisitorReads(()=>true,async ids=>{calls.push(ids)})
  const view = observeReadVisibility(root,ids=>reads.visible(ids))
  view.refresh(); root.dispatchEvent(new dom.window.Event('scroll'))
  await new Promise(resolve=>setTimeout(resolve,0)); expect(calls).toEqual([])
  root.querySelector<HTMLElement>('[aria-modal="true"]')!.style.display='none'
  root.dispatchEvent(new dom.window.Event('scroll'))
  await new Promise(resolve=>setTimeout(resolve,0)); expect(calls).toEqual([['2']])
  view.stop(); dom.window.close()
})
