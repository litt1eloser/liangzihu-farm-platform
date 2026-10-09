import Panel from './panel';
import styles from './control.module.css';
export default function Page(){return <section className={`workspace ${styles.page}`}><div className={styles.heading}><div><p className="eyebrow">生产业务 / 控制准备</p><h1>闸门接入与控制准备</h1><p className="hint">从一台真实闸门开始：整理部署资料、核实现场条件，再按设备推进只读联调和受控验收。</p></div><span className={styles.badge}>接入准备</span></div><Panel/></section>;}

