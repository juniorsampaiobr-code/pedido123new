import{c as h,a as p}from"./index-DdI73wFN.js";import{j as m}from"./tanstack-d4AvmB45.js";import{R as g}from"./vendor-CnEXr6gt.js";import{I as u}from"./label-xft4bAiY.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=h("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]),f=t=>{let e=t.replace(/\D/g,"");return e.length>11&&(e=e.slice(0,11)),e.length>0&&(e=`(${e}`),e.length>3&&(e=`${e.slice(0,3)}) ${e.slice(3)}`),e.length>10&&(e=`${e.slice(0,10)}-${e.slice(10)}`),e},d=g.forwardRef(({className:t,value:e,onChange:n,...s},l)=>{const r=a=>{const c=a.target.value,o=f(c),i={...a,target:{...a.target,value:o}};n(i)};return m.jsx(u,{ref:l,type:"tel",className:p("w-full",t),placeholder:"(99) 99999-9999",value:e,onChange:r,...s})});d.displayName="PhoneInput";export{$ as M,d as P};
