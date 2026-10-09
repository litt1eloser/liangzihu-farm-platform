'use client';

import {useId, useState, type ReactNode} from 'react';
import Link from 'next/link';
import ObjectWorkspace from '@/components/phase3/object-workspace';
import ActionForm from '@/components/platform/action-form';
import {Pick} from '@/components/platform/fields';
import {useApi} from '@/components/platform/use-api';
import type {GateDeployment, GateProtocol} from '@/modules/control/gate-deployments';
import {StockTable} from '../inventory/panel';
import styles from './control.module.css';

type Row = Record<string, any>;
interface Device { id:string; name:string; kind:string; model:string|null; serial_number:string|null; external_id:string; verified:boolean }
interface Overview { devices:Device[]; gateDeployments:GateDeployment[]; currentProfiles:Row[]; profiles:Row[]; rules:Row[]; requests:Row[]; takeovers:Row[]; actualDispatchEnabled:false }
const protocolNames:Record<GateProtocol,string>={unknown:'待厂家确认',mqtt:'MQTT',tcp_rtu:'TCP 透传 Modbus RTU',modbus_tcp:'标准 Modbus TCP'};
const opts=(pairs:[string,string][])=>pairs.map(([id,name])=>({id,name}));
const layerNames:Record<string,string>={request:'申请登记',device_received:'设备收到',electrical:'电气动作',mechanical:'机械到位',effect:'实际效果'};
const resultNames:Record<string,string>={observed:'已观测',not_observed:'未观测到',unknown:'未知'};
const time=(value?:string)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未登记';
function inputTime(value?:string){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function Text({name,label,value,required=false,type='text',max=200}:{name:string;label:string;value?:string|null;required?:boolean;type?:string;max?:number}){
  return <label>{label}<input name={name} type={type} defaultValue={value??''} required={required} maxLength={type==='text'?max:undefined}/></label>;
}
function Notes({name,label,value,required=false,hint,max=2000}:{name:string;label:string;value?:string|null;required?:boolean;hint?:string;max?:number}){
  const hintId=useId();
  return <div className={styles.full}><label>{label}<textarea name={name} defaultValue={value??''} required={required} maxLength={max} rows={3} aria-describedby={hint?hintId:undefined}/></label>{hint&&<span id={hintId} className={styles.fieldHint}>{hint}</span>}</div>;
}
function Section({id,title,description,children,open=false}:{id:string;title:string;description:string;children:ReactNode;open?:boolean}){
  return <details id={id} className={styles.section} open={open}><summary><span>{title}</span><span className={styles.expand} aria-hidden="true">＋</span></summary><div className={styles.formContent}><p className={styles.sectionHint}>{description}</p>{children}</div></details>;
}
function GateIcon(){return <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true"><path d="M11 43V14h30v29M7 43h38M15 20h22v16H15zM26 14V8M21 8h10M15 39h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M20 24v8m6-8v8m6-8v8" stroke="currentColor" strokeWidth="1.5"/></svg>;}

export default function GatePanel(){return <div className={styles.scope}><ObjectWorkspace>{id=><Work objectId={id}/>}</ObjectWorkspace></div>;}
function Work({objectId}:{objectId:string}){
  const {data,error,reload}=useApi<Overview>('/api/v1/control-records/overview?objectId='+objectId);
  const [selected,setSelected]=useState('');
  if(error)return <div className={styles.notice}><p role="alert">{error}</p><button className="secondary" onClick={()=>void reload()}>重试读取</button></div>;
  if(!data)return <p className="empty-state" role="status">正在读取设备和闸门部署资料…</p>;
  const device=data.devices.find(d=>d.id===selected)??data.devices.find(d=>data.gateDeployments.some(g=>g.device_id===d.id))??data.devices[0];
  return <>
    <div className={styles.stats}>
      <div><span>已登记物理设备</span><strong>{data.devices.filter(d=>d.kind==='physical').length}</strong><small>当前对象范围</small></div>
      <div><span>闸门部署档案</span><strong>{data.gateDeployments.length}</strong><small>按设备统计最新版本</small></div>
      <div><span>协议资料待补</span><strong>{data.gateDeployments.filter(d=>d.protocol_status==='pending').length}</strong><small>已建闸门档案中的缺项</small></div>
      <div><span>控制申请记录</span><strong>{data.requests.length}</strong><small>仅登记，未下发</small></div>
    </div>
    {!device?<div className={styles.empty}><GateIcon/><h2>先登记第一台真实闸门</h2><p>当前对象还没有设备。先登记闸门编号、实装型号和来源，再回到这里整理部署资料。</p><div className={styles.links}><Link href="/settings">去配置管理建档</Link><Link href="/devices">查看设备与测点</Link></div><p>资料未到时可保留待确认项；登记设备不会自动建立连接。</p></div>:<>
      <div className={styles.selector}><label>当前设备<select aria-label="当前设备" value={device.id} onChange={event=>setSelected(event.target.value)}>{data.devices.map(d=><option key={d.id} value={d.id}>{d.name}{d.kind!=='physical'?' · 非物理设备':''}</option>)}</select></label><Link href="/devices">查看设备台账 ↗</Link></div>
      <DeviceWorkspace key={device.id} device={device} data={data} reload={()=>void reload()}/>
    </>}
  </>;
}

function DeviceWorkspace({device,data,reload}:{device:Device;data:Overview;reload:()=>void}){
  const deployment=data.gateDeployments.find(g=>g.device_id===device.id),profile=data.currentProfiles.find(p=>p.device_id===device.id);
  const rules=data.rules.filter(r=>r.device_id===device.id),requests=data.requests.filter(r=>r.device_id===device.id);
  const ruleOptions=rules.map(r=>({id:r.id,name:`${r.purpose} / 版本${r.version} / ${r.state==='approved'?'已审核':r.state==='draft'?'草稿':'已撤回'}`}));
  const requestOptions=requests.map(r=>({id:r.id,name:`${r.purpose} / ${time(r.created_at)}`}));
  const common={stableKey:true,onSaved:reload},identity=<input type="hidden" name="deviceId" value={device.id}/>,evidence=<Notes name="evidence" label="实际依据" required max={4000}/>;
  return <div>
    <section className={styles.deviceCard} aria-label="当前设备资料"><div className={styles.deviceTitle}><GateIcon/><div><p className={styles.overline}>{deployment?'闸门部署档案':'已登记设备 · 待建立闸门档案'}</p><h2>{device.name}</h2><p>{device.external_id||'厂家编号未登记'}</p></div><span className={styles.badge}>准备阶段</span></div><dl className={styles.metadata}>
      <div><dt>设备型号</dt><dd>{device.model||'待确认'}</dd></div><div><dt>序列号</dt><dd>{device.serial_number||'待核对'}</dd></div><div><dt>现场核实</dt><dd>{device.verified?'台账已现场核实':'尚未现场核实'}</dd></div><div><dt>通信方式</dt><dd>{deployment?protocolNames[deployment.protocol]:'未登记'}</dd></div>
    </dl><p className={styles.connectionNote}>当前尚未接入执行适配器。保存资料或登记申请均不会使闸门动作。</p></section>
    <ol className={styles.steps} aria-label="闸门接入步骤"><li><b>01</b><div><strong>设备建档</strong><span>{device.verified?'实物已核对':'编号已登记，待现场核对'}</span></div></li><li><b>02</b><div><strong>协议与现场资料</strong><span>{deployment?.protocol_status==='received'?'协议文档已收录，待适配':'待厂家补充与确认'}</span></div></li><li><b>03</b><div><strong>只读联调</strong><span>等待实际适配器开发</span></div></li><li><b>04</b><div><strong>受控验收</strong><span>等待单台联合验收</span></div></li></ol>
    <nav className={styles.shortcuts} aria-label="控制准备分区">{[['gate-setup','部署资料'],['safety','安全条件'],['rules','专业规则'],['requests','申请与反馈'],['takeovers','人工接管']].map(([id,label])=><a key={id} href={'#'+id} onClick={()=>{const section=document.getElementById(id);if(section instanceof HTMLDetailsElement)section.open=true;}}>{label}</a>)}</nav>
    <Section id="gate-setup" title="闸门部署资料" description="先保存已知资料。没有取得的型号、网络或报文信息可以留空；每次保存建立新版本。" open>
      {device.kind!=='physical'?<p className={styles.notice}>当前选择的是网关或通道。请切换到对应的物理闸门设备后登记部署资料。</p>:<>
        {deployment&&<div className={styles.savedNote}>已保存版本 {deployment.version} · {time(deployment.created_at)} · {deployment.protocol_status==='received'?'已收到协议文档，尚未验证兼容性':'资料仍待厂家确认'}</div>}
        <DeploymentForm key={deployment?.id??device.id} deviceId={device.id} deployment={deployment} onSaved={reload}/>
      </>}
      <aside className={styles.protocolNote}><strong>当前协议线索</strong><p>四月沟通记录提到 MQTT、TCP 透传 Modbus RTU。请厂家按实装型号和固件确认；标准 Modbus TCP 需要单独确认。</p></aside>
    </Section>
    <Section id="safety" title="设备三态与断网停电说明" description="分别登记许可、手动或远程模式、现场保护。未知情况保持未知，已核资料填写实际复核期限。">
      <div className={styles.statusRow}><span>{({unknown:'许可未核实',allowed:'许可已登记',denied:'禁止操作'} as Row)[profile?.permission??'unknown']}</span><span>{({unknown:'模式未知',manual:'手动模式',remote:'远程模式'} as Row)[profile?.mode??'unknown']}</span><span>{({unknown:'保护待核',active:'保护生效',clear:'已核未触发'} as Row)[profile?.protection??'unknown']}</span><span>{profile?`复核截止 ${time(profile.valid_until)}`:'尚无安全条件记录'}</span></div>
      <ActionForm key={profile?.id??device.id} path="/api/v1/control-records/profiles" {...common} times={['validUntil']}>{identity}<div className={styles.fields}>
        <label>操作许可<select aria-label="操作许可" name="permission" defaultValue={profile?.permission??'unknown'}><option value="unknown">未核实</option><option value="allowed">已获许可</option><option value="denied">禁止</option></select></label>
        <label>设备手动或远程模式<select aria-label="设备手动或远程模式" name="mode" defaultValue={profile?.mode??'unknown'}><option value="unknown">未知</option><option value="manual">手动</option><option value="remote">远程</option></select></label>
        <label>现场保护<select aria-label="现场保护" name="protection" defaultValue={profile?.protection??'unknown'}><option value="unknown">未知</option><option value="active">保护生效</option><option value="clear">已核未触发</option></select></label>
        <Text name="loadType" label="具体负载类型" value={profile?.load_type??(deployment?'闸门':'')} required/>
        <Notes name="offlineBehavior" label="断网行为（未核实须说明）" value={profile?.offline_behavior} required/><Notes name="powerLossBehavior" label="停电行为（未核实须说明）" value={profile?.power_loss_behavior} required/><Notes name="powerReturnBehavior" label="复电行为（未核实须说明）" value={profile?.power_return_behavior} required/>
        <Notes name="protocolRef" label="实际协议依据或缺口" value={profile?.protocol_ref} required/><Notes name="feedbackRef" label="反馈含义依据或缺口" value={profile?.feedback_ref} required/><Text name="validUntil" label="本次核实有效截止" type="datetime-local" value={inputTime(profile?.valid_until)} required/>
      </div></ActionForm><details><summary>查看安全资料版本</summary><StockTable rows={data.profiles.filter(p=>p.device_id===device.id)} columns={[[ 'version','版本'],['permission','许可'],['mode','模式'],['protection','现场保护'],['valid_until','核实截止']]}/></details>
    </Section>
    <Section id="rules" title="专业规则及版本" description="记录实际用途、触发、停止和人工接管条件。规则草稿须由其他有审核权限人员确认。">
      <ActionForm path="/api/v1/control-records/rules" {...common}>{identity}<div className={styles.fields}><Text name="purpose" label="规则用途" required max={1000}/><Text name="species" label="适用物种" required/><Text name="stage" label="适用阶段" required/><Notes name="conditions" label="触发、停止及人工接管条件" required max={4000}/><Notes name="sourceRef" label="专业依据" required max={4000}/></div></ActionForm>
      {rules.length>0&&<ActionForm path="/api/v1/control-records/rule-review" {...common}><Pick name="id" label="待核规则" options={ruleOptions}/><Pick name="action" label="规则审核动作" options={opts([['approve','独立审核通过'],['withdraw','撤回']])}/>{evidence}</ActionForm>}
      <StockTable rows={rules} columns={[[ 'purpose','用途'],['version','版本'],['state','审核状态']]}/>
    </Section>
    <Section id="requests" title="登记控制申请（不会下发）" description="填写真实目的、授权依据和现场条件。当前申请只留存记录，平台会标明未下发及阻断原因。">
      <ActionForm path="/api/v1/control-records/requests" {...common}>{identity}<Pick name="ruleId" label="专业规则（未有可留空）" options={ruleOptions} required={false}/><div className={styles.fields}><Notes name="purpose" label="本次申请目的" required/><Notes name="authorizationRef" label="本次授权依据" required/><Notes name="conditions" label="本次现场条件" required max={4000}/></div></ActionForm>
    </Section>
    <section className={styles.feedbackSection}><h2>申请与五层反馈</h2><p className={styles.sectionHint}>申请登记、设备收到、电气动作、机械到位和实际效果分别留痕；没有凭证的层级保持未知。</p>
      {requests.length?requests.map(r=><article className={styles.requestCard} key={r.id}><div className={styles.requestTitle}><h3>{r.purpose}</h3><span className={styles.badge}>未下发</span></div><p>申请已登记，未下发。</p><p className={styles.muted}>{r.blocked_reasons.join('；')}</p><ol className={styles.layers}>{r.layers.map((layer:Row)=><li key={layer.layer}><strong>{layerNames[layer.layer]}</strong><span>{resultNames[layer.result]}</span><p>{layer.value??'尚无实际反馈'}</p>{layer.observed_at&&<small>{time(layer.observed_at)}</small>}</li>)}</ol></article>):<p className={styles.emptyRecord}>当前设备尚无控制申请。</p>}
    </section>
    <Section id="feedback" title="记录外部凭证或现场观测" description="填写外部设备回执或现场观察，并注明来源；这些记录不能证明平台曾发送命令。">
      {requests.length?<ActionForm path="/api/v1/control-records/feedback" {...common} times={['observedAt']}><Pick name="requestId" label="相关申请" options={requestOptions}/><div className={styles.fields}><Pick name="layer" label="反馈层级" options={opts([['device_received','设备收到'],['electrical','电气动作'],['mechanical','机械到位'],['effect','实际效果']])}/><Pick name="result" label="观测结果" options={opts([['observed','已观测'],['not_observed','未观测到'],['unknown','未知']])}/><Notes name="value" label="实际反馈值（未知留空）"/><Pick name="source" label="凭证来源" options={opts([['vendor_receipt','外部设备回执'],['field_observation','现场人员观测']])}/><Text name="observedAt" label="实际观测时间" type="datetime-local" required/>{evidence}</div></ActionForm>:<p className={styles.emptyRecord}>登记真实申请后，再关联外部回执或现场观测。</p>}
    </Section>
    <Section id="takeovers" title="人工接管记录" description="只记录实际到场、使用手动装置及接管时间。关联申请可留空。">
      <ActionForm path="/api/v1/control-records/takeovers" {...common} times={['occurredAt']}>{identity}<Pick name="requestId" label="关联申请（可选）" options={requestOptions} required={false}/><div className={styles.fields}><Text name="person" label="实际到场人员" required/><Notes name="manualDevice" label="使用的手动装置" required/><Notes name="conditions" label="到场时条件" required max={4000}/><Text name="occurredAt" label="实际接管时间" type="datetime-local" required/>{evidence}</div></ActionForm><StockTable rows={data.takeovers.filter(t=>t.device_id===device.id)} columns={[[ 'person','到场人'],['manual_device','手动装置'],['conditions','现场条件'],['occurred_at','接管时间']]}/>
    </Section>
  </div>;
}

function DeploymentForm({deviceId,deployment,onSaved}:{deviceId:string;deployment?:GateDeployment;onSaved:()=>void}){
  const [protocol,setProtocol]=useState<GateProtocol>(deployment?.protocol??'unknown'),tcp=protocol==='tcp_rtu'||protocol==='modbus_tcp';
  return <ActionForm path="/api/v1/control-records/gate-deployments" stableKey onSaved={onSaved} label="保存部署资料"><input type="hidden" name="deviceId" value={deviceId}/>
    <fieldset><legend>设备与安装</legend><div className={styles.fields}><Text name="manufacturer" label="厂家（按实物或资料填写）" value={deployment?.manufacturer}/><Text name="controllerModel" label="控制器型号" value={deployment?.controller_model}/><Text name="firmware" label="固件版本" value={deployment?.firmware}/><Notes name="installationRef" label="安装位置与闸门编号对应" value={deployment?.installation_ref} hint="关联实际安装点、设备编号和现场核对依据。"/></div></fieldset>
    <fieldset><legend>协议与网络</legend><div className={styles.fields}>
      <label>通信方式<select aria-label="通信方式" name="protocol" value={protocol} onChange={event=>setProtocol(event.target.value as GateProtocol)}><option value="unknown">待厂家确认</option><option value="mqtt">MQTT</option><option value="tcp_rtu">TCP 透传 Modbus RTU</option><option value="modbus_tcp">标准 Modbus TCP（须单独确认）</option></select></label>
      <label>协议资料状态<select aria-label="协议资料状态" name="protocolStatus" defaultValue={deployment?.protocol_status??'pending'}><option value="pending">待取得或仅有口头线索</option><option value="received">已收到对应型号的协议文档</option></select></label>
      <label>TCP连接方向<select name="tcpRole" aria-label="TCP连接方向" disabled={!tcp} defaultValue={tcp?deployment?.tcp_role??'unknown':'unknown'}><option value="unknown">待确认</option><option value="device_client">设备主动连接平台</option><option value="device_server">平台连接设备</option></select><span className={styles.fieldHint}>只有TCP方式适用；切换MQTT后不保存此项。</span></label>
      <Notes name="protocolRef" label="协议文档版本、来源或待补说明" value={deployment?.protocol_ref} hint="口头记录保留来源日期；收到文档不代表已完成适配。"/>
      <Notes name="networkRef" label="网络路径与原系统共存说明" value={deployment?.network_ref} hint="说明4G、网关或现场主站的接入路径。请勿填写密码、令牌或含凭据的地址。"/>
      <Notes name="messageRef" label="寄存器 / MQTT主题与报文依据" value={deployment?.message_ref} hint="记录文档或脱敏样本编号；参数未知时可留空。"/>
    </div></fieldset><fieldset><legend>状态反馈</legend><Notes name="feedbackRef" label="开度、限位、故障与反馈含义依据" value={deployment?.feedback_ref} hint="设备受理、电气动作、机械到位与实际效果需要各自的真实反馈。"/></fieldset>
  </ActionForm>;
}
