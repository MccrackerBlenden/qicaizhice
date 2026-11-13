/* Coordinated two-scene transition: WebGL camera and HTML share an
   identical perceptual smoothing, while the real next sections overlap. */
(()=>{
  'use strict';
  const scenes=[
    {name:'statements',node:document.getElementById('three-statement-journey'),frame:null,last:-1,p:0},
    {name:'lens',node:document.getElementById('final-lens-journey'),frame:null,last:-1,p:0}
  ];
  if(scenes.some(s=>!s.node))return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('no3d')==='1';
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=(p,a,b)=>{const t=clamp((p-a)/Math.max(.001,b-a));return t*t*(3-2*t)};
  const getTarget=el=>{
    const r=el.getBoundingClientRect();
    return clamp(-r.top/Math.max(1,r.height-innerHeight));
  };
  function ensureFrame(scene){
    if(reduced||scene.frame)return;
    const el=document.createElement('iframe');
    el.title=scene.name==='lens'?'折射镜头动画（装饰）':'三张财务报表穿行动画（装饰）';
    el.tabIndex=-1;el.setAttribute('aria-hidden','true');el.setAttribute('scrolling','no');
    el.loading='eager';el.referrerPolicy='same-origin';
    el.src='./effects/cinematic-scene.html?scene='+scene.name;
    scene.node.querySelector('.cinema-frame').append(el);scene.frame=el;
  }
  function send(scene,target){
    if(scene.frame?.contentWindow)scene.frame.contentWindow.postMessage(
      {type:'qcz-cinema-seek',scene:scene.name,progress:target},location.origin
    );
  }
  let framePending=false;
  function animate(){
    framePending=false;
    let settling=false;
    for(const scene of scenes){
      const r=scene.node.getBoundingClientRect();
      const close=r.bottom>-innerHeight*1.8 && r.top<innerHeight*2.1;
      if(close)ensureFrame(scene);
      const target=getTarget(scene.node);
      /* Legacy Three.js follows target with .075 per frame. Match that
         exact coefficient for surrounding HTML to prevent lagged camera/text. */
      if(reduced){scene.p=target}
      else if(Math.abs(target-scene.p)>.00025){
        scene.p+= (target-scene.p)*.075;
        settling=true;
      }else scene.p=target;
      const p=scene.p;
      scene.node.style.setProperty('--scene-progress',p.toFixed(5));
      if(scene.name==='statements'){
        // Third sheet has time to pass before the joint departure begins.
        const alpha=1-smooth(p,.77,.985);
        const wash=smooth(p,.82,1);
        scene.node.style.setProperty('--exit-opacity',alpha.toFixed(5));
        scene.node.style.setProperty('--exit-wash',wash.toFixed(5));
        scene.node.nextElementSibling?.style.setProperty('--incoming-opacity',
          (r.bottom < 0 ? 1 : smooth(p,.85,.995)).toFixed(5));
        const title=scene.node.querySelector('#cinemaStatementName');
        const label=p<.41?'资产负债表':p<.68?'利润表':'现金流量表';
        if(title && title.textContent!==label)title.textContent=label;
        // keep fallback sheet motion in exact phase with title/camera
        const limits=[.41,.66,.85],xPos=[63,39,62];
        scene.node.querySelectorAll('.fallback-plane').forEach((el,i)=>{
          const k=p/limits[i],scale=.62+Math.min(1.55,k*1.05);
          const x=xPos[i]-(p*Math.sign(i===1?-1:1)*8);
          const visible=k<=.76?1:clamp(1-(k-.76)*3.5);
          el.style.transform=`translate(-50%,-50%) translate3d(${(x-50)*4}px,${(p-.3)*-32}px,${(2-i)*40}px) rotateY(${-14+p*12}deg) scale(${scale})`;
          el.style.opacity=(visible*(.95-i*.10)).toFixed(3);
        });
      }else{
        // Light propagates from lens; text, 3D and light overlap in time.
        const glow=smooth(p,.72,.975);
        const final=smooth(p,.88,1);
        const textAlpha=1-smooth(p,.78,.985);
        const textureAlpha=1-smooth(p,.82,1);
        scene.node.style.setProperty('--handoff',glow.toFixed(5));
        scene.node.style.setProperty('--handoff-final',final.toFixed(5));
        scene.node.style.setProperty('--lens-text-alpha',textAlpha.toFixed(5));
        scene.node.style.setProperty('--lens-texture-alpha',textureAlpha.toFixed(5));
        scene.node.nextElementSibling?.style.setProperty('--incoming-opacity',
          (r.bottom < 0 ? 1 : smooth(p,.87,.998)).toFixed(5));
        const scale=.76+p*1.28;
        scene.node.querySelectorAll('.fallback-lens,.fallback-ring').forEach(el=>{
          el.style.transform=`translate(-50%,-50%) scale(${scale})`;
          el.style.opacity=(1-final*.87).toFixed(4);
        });
      }
      // The iframe takes the target and performs its own native .075 easing;
      // CSS takes our synchronously eased p above. The two end in step.
      if(scene.frame && (close||Math.abs(target-scene.last)>.001)){
        send(scene,target);scene.last=target;
      }
    }
    if(settling)schedule();
  }
  function schedule(){if(!framePending){framePending=true;requestAnimationFrame(animate)}}
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('pageshow',schedule);
  addEventListener('message',event=>{
    if(event.origin!==location.origin || !event.data || event.data.type!=='qcz-cinema-ready')return;
    const scene=scenes.find(s=>s.name===event.data.scene && s.frame?.contentWindow===event.source);
    if(!scene)return;
    if(event.data.webgl)scene.node.querySelector('.cinema-frame')?.classList.add('loaded');
    schedule();
  });
  animate();
})();
