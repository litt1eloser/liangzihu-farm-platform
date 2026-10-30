'use client';

import {useState} from 'react';
import DataList from '@/components/platform/data-list';
import DeviceManagement from './device-management';
import DeviceOverview from './device-overview';
import styles from './devices.module.css';

export default function DevicesPage() {
  const [deviceRevision,setDeviceRevision]=useState(0);
  return <section className={`workspace ${styles.page}`}>
    <div className={styles.heading}>
      <div><p className="eyebrow">空间与资料 / 设备监测</p><h1>设备与测点</h1><p className={styles.subtitle}>一处查看设备档案、采集数据与历史记录。</p></div>
      <a href="#register" className={styles.registerLink} onClick={()=>{const section=document.getElementById('register');if(section instanceof HTMLDetailsElement)section.open=true;}}>＋ 登记设备</a>
    </div>
    <DeviceOverview refreshKey={deviceRevision}/>
    <div className={styles.managementHeading}><h2>登记与台账</h2><p>维护设备及数据来源，查阅完整记录。</p></div>
    <DeviceManagement onDeviceSaved={()=>setDeviceRevision(value=>value+1)}/>
    <details className={styles.ledger}><summary><span>完整设备台账<small>物理设备、网关及摄像通道</small></span><span className={styles.expand} aria-hidden="true">＋</span></summary><div className={styles.ledgerBody}><DataList path="/api/v1/devices?limit=200" refreshKey={deviceRevision} columns={[{key:'name',label:'设备'},{key:'kind',label:'类别'},{key:'model',label:'型号'},{key:'external_id',label:'厂家编号'},{key:'object_name',label:'对象'},{key:'verified',label:'核实'}]}/></div></details>
    <details className={styles.ledger}><summary><span>完整测点台账<small>指标、单位、时效依据与历史入口</small></span><span className={styles.expand} aria-hidden="true">＋</span></summary><div className={styles.ledgerBody}><DataList path="/api/v1/points" linkPrefix="/points/" columns={[{key:'code',label:'编号与历史入口'},{key:'name',label:'名称'},{key:'device_name',label:'设备'},{key:'metric',label:'指标'},{key:'unit',label:'单位'},{key:'timing_source',label:'时效依据'}]}/></div></details>
  </section>;
}
