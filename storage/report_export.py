"""v3.0-C: dependency-free local report exports (XLSX OOXML + browser-rendered PDF).
Processes normalized analysis report data only. Does not fetch or transmit user financial data.
Requires locally installed Edge/Chrome/Chromium for direct PDF printing.
"""
import html, json, math, os, re, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from io import BytesIO
from xml.sax.saxutils import escape as xescape

LIMIT=1024*1024
SCHEMA='qcz.decision-brief.v2.6'

def validate(packet):
    if not isinstance(packet,dict) or set(packet)-{'document','record'}: raise ValueError('请求字段无效')
    d=packet.get('document'); r=packet.get('record') or {}
    if not isinstance(d,dict) or d.get('schema')!=SCHEMA: raise ValueError('不支持的报告格式')
    c=d.get('context'); s=d.get('sections'); st=d.get('status')
    if not isinstance(c,dict) or not isinstance(s,dict) or not isinstance(st,dict):raise ValueError('报告上下文缺失')
    if not isinstance(c.get('entity'),str) or not 1<=len(c['entity'])<=100:raise ValueError('企业名称异常')
    if not isinstance(c.get('fiscal_year'),int) or not 1990<=c['fiscal_year']<=2100:raise ValueError('报告年度异常')
    if not isinstance(c.get('snapshot_id'),str) or len(c['snapshot_id'])>100:raise ValueError('财务版本异常')
    if not isinstance(r,dict) or r.get('review_state','draft') not in ('draft','reviewed') or r.get('version_state','current') not in ('current','other','historical','blocked','changed','missing'):raise ValueError('复核/财务版本状态无效')
    for k in ('findings','financials','trends','cases','sources','limitations','summary'):
        if k not in d:raise ValueError('报告缺少 '+k)
    if not any(s.get(k) for k in ('findings','metrics','trends','cases','sources','periods')):raise ValueError('至少选择一个报告章节')
    if c.get('report_scope')=='period':
        pa=d.get('period_analysis')
        if not isinstance(pa,dict) or not s.get('periods') or pa.get('schema')!='qcz.period-report.v3.0-G':raise ValueError('期间报告数据或章节无效')
        if pa.get('frequency') not in ('month','quarter') or pa.get('flow_basis') not in ('period','ytd'):raise ValueError('期间口径无效')
        period_rows=pa.get('rows')
        if not isinstance(period_rows,list) or not 1<=len(period_rows)<=120:raise ValueError('期间明细数量无效')
        for row in period_rows:
            if not isinstance(row,dict) or not re.fullmatch(r'\d{4}-(?:\d{2}|Q[1-4])',str(row.get('period',''))):raise ValueError('期间编号无效')
            for field in ('revenue','net_income','operating_cf','assets','net_margin','prior_change_pct','yoy_change_pct'):
                v=row.get(field)
                if v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>1e15):raise ValueError('期间金额与比率异常')
        if c.get('focus_period')!=period_rows[-1].get('period'):raise ValueError('报告焦点期间与明细不一致')
    return d,r

def txt(s,n=600):return html.escape(str(s if s is not None else '—')[:n],quote=True)
def val(v):return '—' if v is None or isinstance(v,float) and not math.isfinite(v) else str(v)
def rows(d,path):
    a=d
    for p in path.split('.'):
        if not isinstance(a,dict):return []
        a=a.get(p)
    return a if isinstance(a,list) else []
def render_html(packet):
    d,r=validate(packet); c=d['context']; sc=d['sections']; st=d['status']
    review='人工已核对（本地登记；非审核批准）' if r.get('review_state')=='reviewed' else '内部草稿 · 尚未登记人工核对'
    banner='本年度数值校验或原文核对存在阻断，不得用于经营结论。' if st.get('blocked') else '本报告为基于用户提供数据的计算分析，不构成审计、认证或投资建议。'
    if r.get('version_state','current')!='current':banner+=' 该报告属于旧财务版本或待重新核验，不是当前最新结论。'
    x=['<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><title>企财智策管理分析报告</title>',
       '<style>@page{size:A4;margin:16mm 15mm}*{box-sizing:border-box}body{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#233649;font-size:11px;line-height:1.55;margin:0}h1{font-size:27px;color:#163b58;line-height:1.4;margin:9px 0}h2{color:#163b58;font-size:16px;margin:25px 0 9px;border-bottom:1px solid #cbdde7;padding-bottom:7px;break-after:avoid}h3{font-size:12px;margin:12px 0 4px}p{margin:4px 0 9px}header{border-bottom:3px solid #1b577a;padding:9px 0 17px}.eyebrow{color:#527a90;letter-spacing:2px;font-weight:700}.meta{font-size:10px;color:#587184}.notice{background:#eaf3f7;border-left:4px solid #277998;margin-top:18px;padding:12px}.warning{background:#fff0e5;border-color:#a85c26}.section{break-inside:auto}.card{border:1px solid #dae5eb;padding:9px 11px;margin:7px 0;break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;word-break:break-word}th,td{border:1px solid #d5e0e8;padding:6px;vertical-align:top}th{background:#eaf2f7}tr{break-inside:avoid}footer{border-top:1px solid #d3e0e8;color:#6a8292;padding-top:10px;margin-top:28px;font-size:9px}</style></head><body>',
       f'<header><div class="eyebrow">QICAI INTELLIGENCE / MANAGEMENT REPORT</div><h1>{txt(c["entity"])} · {txt(c.get("focus_period")+" 期间经营分析" if c.get("report_scope")=="period" else str(c["fiscal_year"])+" 年财务分析")}</h1><div class="meta">财务快照：{txt(c["snapshot_id"])} · 报告编号：{txt(r.get("id",""))}<br>生成：{txt(d.get("generated_at",""))} · 单位：万元 · {txt(review)}</div></header>',
       f'<div class="notice {"warning" if st.get("blocked") else ""}"><b>{txt(d.get("summary",{}).get("headline",""))}</b><p>{txt(d.get("summary",{}).get("body",""))}</p><p>{txt(banner)}</p></div>']
    def table(head,data):
        h='<table><thead><tr>'+''.join('<th>'+txt(v)+'</th>' for v in head)+'</tr></thead><tbody>'
        for row in data[:600]:h+='<tr>'+''.join('<td>'+txt(val(v),1000)+'</td>' for v in row)+'</tr>'
        return h+('</tbody></table>' if data else f'<tr><td colspan="{len(head)}">暂无适用记录</td></tr></tbody></table>')
    if sc.get('findings'):
        x+=['<section class="section"><h2>01 · 当前经营观察</h2>']
        if st.get('blocked'):x+=['<p>当前年度被数据质量检查阻断，不输出经营观察或风险评级。</p>']
        else:
            for it in rows(d,'findings.issues'):x += [f'<div class="card"><h3>{txt(it.get("title"))}</h3><p>{txt(it.get("description"))}</p><p class="meta">{txt(it.get("interpretation"))}；后续核对：{txt(it.get("follow_up"))}</p></div>']
            x += [table(['观察规则','内部阈值','本期判定','跨期状态'],[[i.get('title'),i.get('criterion'),'无法判断' if i.get('hit') is None else '触发' if i.get('hit') else '未触发',i.get('state_label')] for i in rows(d,'findings.rules')])]
        x+=['</section>']
    if sc.get('metrics'):
        x+=['<section class="section"><h2>02 · 财务指标及数值核查</h2>',table(['检查项目','状态','差额（万元）'],[[i.get('label'),i.get('status'),i.get('delta')] for i in rows(d,'financials.checks')])]
        if st.get('blocked'):x+=['<p>因数据核验阻断，财务比率不作为可用经营结论输出。</p>']
        else:x+=[table(['指标','实测值','公式/适用说明'],[[i.get('label'),(round(i['value'],4) if isinstance(i.get('value'),(int,float)) else '不可计算'),str(i.get('formula',''))+'；'+str(i.get('note',''))] for i in rows(d,'financials.metrics')])]
        x+=['</section>']
    if sc.get('trends'):
        x+=['<section class="section"><h2>03 · 历史期间趋势</h2>']
        if st.get('blocked'):x+=['<p>当前年度数据核验被阻断，不依据趋势推断本期经营状况。</p>']
        else:
            trends=[]
            for metric in rows(d,'trends'):
                for point in metric.get('points',[]):trends.append([metric.get('label'),point.get('year'),point.get('value') if point.get('available') else '不可计算',metric.get('unit'),point.get('change') if point.get('comparable') else '—'])
            x+=[table(['指标','年度','数值','单位','相邻上年变化'],trends)]
        x+=['</section>']
    if sc.get('cases'):
        x+=['<section class="section"><h2>04 · 人工核验与处理记录</h2>', '<p>以下为使用者本人填写的证据与跟进事项；未登记的内容不代表已经核查或关闭。</p>',table(['年度/规则','人工判断','有效状态','证据位置','计划','下次复查'],[[i.get('year'),i.get('assessment_label'),i.get('freshness_label'),i.get('evidence'),i.get('action'),i.get('next_check')] for i in rows(d,'cases')]),'</section>']
    if sc.get('periods'):
        p=d['period_analysis']
        x+=['<section class="section"><h2>经营期间分析 · '+txt('月度' if p['frequency']=='month' else '季度')+'</h2>',
            '<p>利润表与现金流口径：'+txt('年初累计差分' if p['flow_basis']=='ytd' else '单期发生额')+'；金额单位：万元。期末资产不是跨期求和；缺期或比较期时不补零。</p>',
            table(['期间','收入(万元)','净利润(万元)','经营现金流(万元)','期末资产(万元)','净利率%','环比%','同比%','可用性'],
                  [[t.get('period'),t.get('revenue'),t.get('net_income'),t.get('operating_cf'),t.get('assets'),t.get('net_margin'),t.get('prior_change_pct'),t.get('yoy_change_pct'),'完整' if t.get('usable') else '缺失／不可计算'] for t in p['rows']]),
            '<h3>季度、年度完整性</h3>',
            table(['汇总期间','状态','缺失期间'],[[z.get('period'),'完整' if z.get('available') else '不完整','、'.join(z.get('missing') or [])] for z in (p.get('quarters',[])+p.get('years',[]))])]
        bad=[(year.get('year'),i.get('field')) for year in p.get('annual_reconcile',[]) for i in year.get('differences',[]) if not i.get('consistent')]
        if bad:x+=['<p class="warning">期间汇总与已上传年度数据不一致，请核对；本系统未自动覆盖年度原表。</p>']
        x+=['</section>']
    if sc.get('sources'):
        x+=['<section class="section"><h2>05 · 报表来源和适用范围</h2>',table(['报表','文件/工作表','单位','SHA-256'],[[i.get('statement'),i.get('file'),i.get('unit'),i.get('sha256')] for i in rows(d,'sources.files')]),'<h3>重要限制</h3>']
        for line in d.get('limitations',[])[:30]:x+=[f'<p>• {txt(line)}</p>']
        x+=['</section>']
    x+=[f'<footer>报告状态：{txt(review)}。生成后任何财务修订均不会更改此报告；如需更新，请重新生成并登记。报告仅用于内部管理参考。{txt(r.get("review_note",""))}</footer>','</body></html>']
    return ''.join(x)

def spreadsheet(packet):
    d,r=validate(packet);c=d['context'];sec=d['sections'];stat=d['status']
    sheets=[]
    status=('人工已核对（非审核批准）' if r.get('review_state')=='reviewed' else '草稿（未人工核对）')
    overview=[['企财智策 · 财务管理报告',c['entity']],['分析期间',c.get('focus_period') if c.get('report_scope')=='period' else c['fiscal_year']],['财务快照',c.get('snapshot_id')],['报告ID',r.get('id')],['报告状态',status],['当前版本匹配','是' if r.get('version_state','current')=='current' else '否，历史/需重新核验'],['编制时间',d.get('generated_at')],['货币与单位','人民币 · 万元'],['真实性认证','未核实'],['本期计算被阻断','是' if stat.get('blocked') else '否'],['报告摘要',d.get('summary',{}).get('headline')],['说明',d.get('summary',{}).get('body')],['重要声明','草稿及人工复核记录不构成正式审计批准']]
    sheets.append(('报告说明',overview))
    if sec.get('findings'):
        sheets.append(('财务观察',[['观察','说明','阈值','本期状态']]+([] if stat.get('blocked') else [[x.get('title'),x.get('description'),x.get('interpretation'),x.get('follow_up')] for x in rows(d,'findings.issues')])))
        sheets.append(('规则跟踪',[['规则','判断依据','状态','跨期状态']]+([] if stat.get('blocked') else [[x.get('title'),x.get('criterion'),'不可判断' if x.get('hit') is None else '触发' if x.get('hit') else '未触发',x.get('state_label')] for x in rows(d,'findings.rules')])))
    if sec.get('metrics'):
        sheets.append(('会计勾稽',[['项目','状态','差额（万元）']]+[[x.get('label'),x.get('status'),x.get('delta')] for x in rows(d,'financials.checks')]))
        sheets.append(('财务指标',[['指标','实测值','单位','公式','限制']]+([] if stat.get('blocked') else [[x.get('label'),x.get('value') if x.get('available') else None,x.get('unit'),x.get('formula'),x.get('note')] for x in rows(d,'financials.metrics')])))
    if sec.get('trends'):
        trends=[['指标','年度','实测值','单位','相邻变化','可用性']]
        if not stat.get('blocked'):
            for t in rows(d,'trends'):
                for p in t.get('points',[]):trends.append([t.get('label'),p.get('year'),p.get('value') if p.get('available') else None,t.get('unit'),p.get('change') if p.get('comparable') else None,'可用' if p.get('available') else p.get('reason')])
        sheets.append(('历史趋势',trends))
    if sec.get('cases'):
        sheets.append(('核验与处理',[['年度','规则','人工判断','证据状态','证据位置','处理计划','下次复查']]+[[p.get('year'),p.get('rule'),p.get('assessment_label'),p.get('freshness_label'),p.get('evidence'),p.get('action'),p.get('next_check')] for p in rows(d,'cases')]))
    if sec.get('periods'):
        p=d['period_analysis']
        sheets.append(('期间经营明细',[['期间','营收_万元','净利_万元','经营现金流_万元','期末资产_万元','净利率_%','环比_%','同比_%','是否可算']]+[[x.get('period'),x.get('revenue'),x.get('net_income'),x.get('operating_cf'),x.get('assets'),x.get('net_margin'),x.get('prior_change_pct'),x.get('yoy_change_pct'),'是' if x.get('usable') else '否'] for x in p['rows']]))
        sheets.append(('期间完整性',[['期间','可计算','缺少资料']]+[[x.get('period'),'是' if x.get('available') else '否','、'.join(x.get('missing') or [])] for x in p.get('quarters',[])+p.get('years',[])]))
        sheets.append(('期间来源说明',[['频率','口径'],['月度' if p['frequency']=='month' else '季度','YTD差分' if p['flow_basis']=='ytd' else '单期发生额'],['重要限制','资产为期末余额，期间发生额不可与年度数值重复相加；缺期不补零']]))
    if sec.get('sources'):
        sheets.append(('来源指纹',[['报表','文件/工作表','单位','SHA256']]+[[p.get('statement'),p.get('file'),p.get('unit'),p.get('sha256')] for p in rows(d,'sources.files')]))
        sheets.append(('报告限制',[['需关注的限制']]+[[p] for p in d.get('limitations',[])[:40]]))
    def col(n):
        s='';n+=1
        while n:s=chr(65+(n-1)%26)+s;n=(n-1)//26
        return s
    def xml_sheet(data):
        out=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>']
        width=max((len(row) for row in data),default=1)
        for i in range(width):out.append(f'<col min="{i+1}" max="{i+1}" width="{42 if i==0 else 26}" customWidth="1"/>')
        out.append('</cols><sheetData>')
        for rid,row in enumerate(data[:800],1):
            out.append(f'<row r="{rid}">')
            for i,v in enumerate(row[:25]):
                if v is None:continue
                cell=f'{col(i)}{rid}';st='1' if rid==1 else '0'
                if type(v) in (int,float) and math.isfinite(v):out.append(f'<c r="{cell}" s="{st}"><v>{v}</v></c>')
                else:
                    text=str(v).replace('\x00','')[:4000]
                    # Inline text cells are NEVER formulas (also protects cells beginning with =,+,-,@).
                    out.append(f'<c r="{cell}" s="{st}" t="inlineStr"><is><t xml:space="preserve">{xescape(text)}</t></is></c>')
            out.append('</row>')
        out.append('</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>')
        return ''.join(out).encode()
    bio=BytesIO()
    with zipfile.ZipFile(bio,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        defs=['<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>']
        for i in range(1,len(sheets)+1):defs.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
        z.writestr('[Content_Types].xml',''.join(defs)+'</Types>')
        z.writestr('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(f'<sheet name="{xescape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i,(name,_) in enumerate(sheets,1))+'</sheets></workbook>')
        rels=['<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
        for i in range(1,len(sheets)+1):rels.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        rels.append(f'<Relationship Id="rId{len(sheets)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr('xl/_rels/workbook.xml.rels',''.join(rels))
        z.writestr('xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Microsoft YaHei"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173C56"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>')
        for i,(_,drows) in enumerate(sheets,1):z.writestr(f'xl/worksheets/sheet{i}.xml',xml_sheet(drows))
    return bio.getvalue()

def find_browser():
    env=os.getenv('QZ_PDF_BROWSER')
    if env:
        p=Path(env)
        if p.is_file():return str(p)
    names=['msedge.exe','chrome.exe','chromium','chromium-browser','google-chrome','microsoft-edge']
    for n in names:
        match=shutil.which(n)
        if match:return match
    if sys.platform=='win32':
        for root in [os.getenv('PROGRAMFILES(X86)',''),os.getenv('PROGRAMFILES',''),os.getenv('LOCALAPPDATA','')]:
            if root:
                for relative in ('Microsoft/Edge/Application/msedge.exe','Google/Chrome/Application/chrome.exe'):
                    path=Path(root)/relative
                    if path.is_file():return str(path)
    raise RuntimeError('未找到 Edge/Chrome；仍可使用 HTML 报告在浏览器中打印为 PDF')

def pdf_reportlab(packet):
    """Prefer a local PDF renderer if already present; never send content to an external service."""
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, KeepTogether
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.lib.pagesizes import A4
    d,r=validate(packet)
    try:pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    except Exception:pass
    buf=BytesIO()
    font='STSong-Light'; ink=colors.HexColor('#193D56'); muted=colors.HexColor('#576F82'); fog=colors.HexColor('#EAF1F5')
    doc=SimpleDocTemplate(buf,pagesize=A4,leftMargin=37,rightMargin=37,topMargin=42,bottomMargin=42,metadata={'Title':'企财智策财务管理报告','Author':'Qicaizhice'})
    styles={
     'title':ParagraphStyle('qztitle',fontName=font,fontSize=20,leading=27,textColor=ink,spaceAfter=12),
     'head':ParagraphStyle('qzhead',fontName=font,fontSize=13,leading=19,textColor=ink,spaceBefore=20,spaceAfter=11),
     'body':ParagraphStyle('qzbody',fontName=font,fontSize=9.5,leading=15,spaceAfter=8),
     'small':ParagraphStyle('qzsmall',fontName=font,fontSize=8,leading=12,textColor=muted,spaceAfter=5),
     'cell':ParagraphStyle('qzcell',fontName=font,fontSize=7.5,leading=11,wordWrap='CJK'),
     'headcell':ParagraphStyle('qzheadcell',fontName=font,fontSize=7.5,leading=11,textColor=colors.white,wordWrap='CJK'),
    }
    story=[]
    def para(s,style='body',maxlen=950):
        value=str(s if s is not None else '—')[:maxlen].replace('·',' / ').replace('•','-')
        return Paragraph(html.escape(value),styles[style])
    def pdf_cell(v):
        if isinstance(v,float) and math.isfinite(v):return f'{v:.2f}'
        return val(v)
    def heading(s):story.append(para(s,'head'))
    def add_table(header,data,width=None):
        if not data:data=[['暂无适用记录']+['']*(len(header)-1)]
        # Cap number of rows and column cell text, so generated reports remain printable.
        out=[[para(z,'headcell') for z in header]]+[[para(pdf_cell(v),'cell',130) for v in row] for row in data[:350]]
        cw=(A4[0]-74)/len(header)
        t=Table(out,colWidths=[cw]*len(header),repeatRows=1,hAlign='LEFT',splitByRow=1)
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),ink),('TEXTCOLOR',(0,0),(-1,0),colors.white),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,fog]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.5,colors.HexColor('#9CB6C7'))]))
        story.append(t)
    c=d['context'];s=d['sections'];st=d['status']
    story+=[para('QICAI INTELLIGENCE / MANAGEMENT REPORT','small'),para(f'{c["entity"]} / '+(str(c.get('focus_period'))+' 期间经营分析' if c.get('report_scope')=='period' else f'{c["fiscal_year"]} 年财务分析'),'title'),para(f'财务快照：{c.get("snapshot_id")} / 生成于 {d.get("generated_at","")}','small')]
    story.append(para('人工已核对（非正式审批）' if r.get('review_state')=='reviewed' else '内部草稿 · 未登记人工核对','small'))
    story.append(para(d.get('summary',{}).get('headline','')))
    story.append(para(d.get('summary',{}).get('body','')))
    story.append(para('本报告为非审计报告，来源真实性尚未独立验证；单用户核对登记不构成正式批准。','small'))
    if r.get('version_state','current')!='current':story.append(para('重要：当前选择的报告并非最新有效财务版本，不能当作最新结论。','body'))
    if s.get('findings'):
        heading('01 / 当前年度发现')
        if st.get('blocked'):story.append(para('本年度存在会计或来源核验阻断，经营判断暂不输出。'))
        else:
            for item in rows(d,'findings.issues')[:16]:story.append(para(item.get('title')));story.append(para(item.get('description'),'small'))
            add_table(['内部规则','判定依据','状态'],[[t.get('title'),t.get('criterion'),'不可判断' if t.get('hit') is None else '触发' if t.get('hit') else '未触发'] for t in rows(d,'findings.rules')])
    if s.get('metrics'):
        heading('02 / 计算指标与会计勾稽')
        add_table(['勾稽检查','状态','差额'],[[t.get('label'),t.get('status'),t.get('delta')] for t in rows(d,'financials.checks')])
        if st.get('blocked'):story.append(para('财务比率输出已阻断。'))
        else:add_table(['财务指标','实测值','公式及说明'],[[t.get('label'),round(t['value'],3) if isinstance(t.get('value'),(int,float)) else '不可计算',str(t.get('formula',''))+' / '+str(t.get('note',''))] for t in rows(d,'financials.metrics')])
    if s.get('trends'):
        heading('03 / 多年度趋势')
        if st.get('blocked'):story.append(para('本年度数据被阻断，不利用历史指标推导本期经营结论。'))
        else:
            trend=[]
            for m in rows(d,'trends'):
                for point in m.get('points',[]):trend.append([m.get('label'),point.get('year'),round(point['value'],3) if isinstance(point.get('value'),(int,float)) else '不可计算',m.get('unit')])
            add_table(['指标','年度','数值','单位'],trend)
    if s.get('cases'):
        heading('04 / 人工核验和处理')
        add_table(['年度/规则','人工判断','证据定位','待办计划'],[[str(t.get('year'))+' '+str(t.get('rule')),t.get('assessment_label'),t.get('evidence'),t.get('action')] for t in rows(d,'cases')])
    if s.get('periods'):
        p=d['period_analysis']
        heading('经营期间分析 · '+('月度' if p['frequency']=='month' else '季度'))
        story.append(para('利润表和现金流量表口径：'+('YTD年初累计差分' if p['flow_basis']=='ytd' else '单期发生额')+'。期末余额不跨期间相加；缺失及同比不可计算时不补零。','small'))
        add_table(['期间','营收(万元)','净利润(万元)','经营现金流(万元)','期末资产(万元)','净利率%','同比%'],[[x.get('period'),x.get('revenue'),x.get('net_income'),x.get('operating_cf'),x.get('assets'),x.get('net_margin'),x.get('yoy_change_pct')] for x in p['rows']])
        add_table(['季度/年度','可核算','缺少资料'],[[x.get('period'),'是' if x.get('available') else '否','、'.join(x.get('missing') or [])] for x in p.get('quarters',[])+p.get('years',[])])
    if s.get('sources'):
        heading('05 / 文件来源与限制')
        add_table(['报表','文件/工作表','SHA-256'],[[t.get('statement'),t.get('file'),t.get('sha256')] for t in rows(d,'sources.files')])
        for limit in d.get('limitations',[])[:20]:story.append(para('• '+str(limit),'small'))
    story.append(Spacer(1,15));story.append(para('报告数据与创建时的财务快照绑定；后续修订不自动更新旧报告。请勿将草稿作为经审计财务报告。','small'))
    def footer(canvas,document):
        canvas.setFont(font,8);canvas.setFillColor(muted);canvas.drawString(37,25,'企财智策 / 内部管理分析 / 非审计报告');canvas.drawRightString(A4[0]-37,25,str(document.page))
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return buf.getvalue()

def render_pdf(packet):
    try:
        return pdf_reportlab(packet)
    except (ImportError,ModuleNotFoundError):
        pass
    source=render_html(packet)
    with tempfile.TemporaryDirectory(prefix='qcz-report-') as temp:
        root=Path(temp);htmlpath=root/'report.html';pdfpath=root/'report.pdf';htmlpath.write_text(source,encoding='utf-8')
        browser=find_browser()
        args=[browser,'--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-javascript','--no-pdf-header-footer',f'--user-data-dir={root/"browser"}',f'--print-to-pdf={pdfpath}',htmlpath.as_uri()]
        if os.geteuid()==0 if hasattr(os,'geteuid') else False:args.insert(1,'--no-sandbox')
        try:subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=32,check=False)
        except subprocess.TimeoutExpired:raise RuntimeError('PDF 渲染超时；可改用 HTML 打印')
        if not pdfpath.exists() or pdfpath.stat().st_size<500 or pdfpath.read_bytes()[:4]!=b'%PDF':raise RuntimeError('浏览器 PDF 渲染失败；请使用 HTML 直接打印')
        return pdfpath.read_bytes()

def generate(packet,kind):
    if kind=='xlsx':return spreadsheet(packet)
    if kind=='pdf':return render_pdf(packet)
    raise ValueError('不支持的导出文件类型')

if __name__=='__main__':
    try:
        mode=sys.argv[1]
        raw=sys.stdin.buffer.read(LIMIT+1)
        if len(raw)>LIMIT:raise ValueError('报告请求超过1MB')
        result=generate(json.loads(raw),mode)
        if len(result)>12*1024*1024:raise ValueError('导出文件超过允许大小')
        sys.stdout.buffer.write(result)
    except (ValueError,RuntimeError,KeyError,TypeError) as exc:
        sys.stderr.write(str(exc)[:300]);sys.exit(2)
