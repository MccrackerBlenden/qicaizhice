(()=>{
  'use strict';
  const $=q=>document.querySelector(q);
  const tabs=Array.from(document.querySelectorAll('[data-stage]'));
  const presentations=[
    {small:'01 / DATA FOUNDATION',title:'先理解数据，<br>才谈得上分析。',desc:'连接三张报表，核对字段、期间与勾稽关系。',markup:`<div class="statement-grid"><div class="statement"><span class="st-icon">≡</span><strong>资产负债表</strong><span class="st-bar"></span></div><div class="statement"><span class="st-icon">⌁</span><strong>利润表</strong><span class="st-bar"></span></div><div class="statement"><span class="st-icon">↗</span><strong>现金流量表</strong><span class="st-bar"></span></div></div><div class="process-line"><span class="node active">原始材料</span><b>→</b><span class="node active">口径核验</span><b>→</b><span class="node">开始分析</span></div>`},
    {small:'02 / FINANCIAL ANALYSIS',title:'不止看指标，<br>还要看见关系。',desc:'选择年度或独立期间，理解经营变化与财务联系。',markup:`<div class="analysis-screen"><div class="analysis-chart"><svg viewBox="0 0 370 115" role="img" aria-label="示意性变化曲线，不含真实财务数值"><path d="M0 30 H370 M0 60 H370 M0 90 H370" fill="none" stroke="#30434c" stroke-width="1"/><path d="M0 90 C45 85 63 54 100 67 S154 88 194 50 S262 79 310 37 S346 44 370 17" fill="none" stroke="#9bdbc7" stroke-width="3"/><path d="M0 105 C40 94 85 104 130 83 S216 101 260 72 S333 90 370 60" fill="none" stroke="#cb955d" stroke-width="2" stroke-dasharray="5 7"/></svg></div><div class="analysis-chips"><span>盈利质量</span><span>现金实现</span><span>偿债能力</span></div><div class="process-line"><span class="node active">期间分析</span><b>→</b><span class="node active">关系诊断</span><b>→</b><span class="node">核对依据</span></div></div>`},
    {small:'03 / EVIDENCE & REPORT',title:'结论有依据，<br>报告才可信。',desc:'把结果与来源、计算口径和项目快照关联起来。',markup:`<div class="report-screen"><div class="report-doc"><span class="report-ribbon">财务分析报告</span><i></i><i></i><i></i><i></i></div><div class="report-trace"><div><span class="trace-dot"></span><strong>结果指标</strong></div><div><span class="trace-dot"></span><strong>计算公式</strong></div><div><span class="trace-dot"></span><strong>原始来源</strong></div></div></div><div class="process-line"><span class="node active">分析结果</span><b>→</b><span class="node active">证据追溯</span><b>→</b><span class="node">报告导出</span></div>`}
  ];
  function chooseStage(n){const d=presentations[n];if(!d)return;
    tabs.forEach((t,i)=>{const active=i===n;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;});
    $('#stageEyebrow').textContent=d.small;$('#stageTitle').innerHTML=d.title;$('#stageDesc').textContent=d.desc;$('#stageContent').innerHTML=d.markup;
  }
  tabs.forEach((b,i)=>{b.addEventListener('click',()=>chooseStage(i));b.addEventListener('keydown',ev=>{if(ev.key==='ArrowRight'||ev.key==='ArrowLeft'){ev.preventDefault();const next=(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;chooseStage(next);tabs[next].focus();}})});
  const toggle=$('#navToggle'),nav=$('#navMain');
  toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');toggle?.setAttribute('aria-expanded','false')}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav?.classList.remove('open');toggle?.setAttribute('aria-expanded','false')}});
  const progress=$('#progress');let pending=false;
  function track(){const h=document.documentElement,range=Math.max(1,h.scrollHeight-innerHeight);if(progress)progress.style.width=Math.min(100,100*scrollY/range)+'%';pending=false;}
  addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(track)}},{passive:true});track();
  // No data requests, trackers, libraries, or animation prerequisites on this homepage.
})();
