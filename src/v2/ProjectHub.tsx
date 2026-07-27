import { useState } from 'react';
import { ArrowRight, Clock3, FolderOpen, LogOut, Plus, Sparkles } from 'lucide-react';
import type { ProjectSummary, SystemTemplate } from './types';

type Props = {
  projects: ProjectSummary[];
  templates: SystemTemplate[];
  loading: boolean;
  error: string;
  username: string;
  avatar: string;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onTemplate: (id: string) => void;
  onLogout: () => void;
};

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

export default function ProjectHub(props: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('未命名项目');

  return (
    <main className="v2-hub">
      <header className="v2-hub__topbar">
        <div className="v2-brand"><span><Sparkles size={17} /></span><strong>Infinite Canvas</strong></div>
        <div className="v2-account">
          {props.avatar ? <img src={props.avatar} alt="" /> : <span className="v2-account__avatar">{props.username.slice(0, 1).toUpperCase()}</span>}
          <span>{props.username}</span>
          <button type="button" title="退出登录" onClick={props.onLogout}><LogOut size={17} /></button>
        </div>
      </header>

      <div className="v2-hub__content">
        <section className="v2-hub__section">
          <div className="v2-section-heading">
            <div><h1>项目</h1><span>{props.projects.length} 个云端项目</span></div>
            <button className="v2-primary-button" type="button" onClick={() => setCreating(true)}><Plus size={17} />新建项目</button>
          </div>
          {creating && (
            <form className="v2-create-row" onSubmit={(event) => { event.preventDefault(); props.onCreate(name.trim() || '未命名项目'); setCreating(false); }}>
              <input autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
              <button className="v2-primary-button" type="submit">创建</button>
              <button className="v2-text-button" type="button" onClick={() => setCreating(false)}>取消</button>
            </form>
          )}
          {props.error && <div className="v2-banner v2-banner--error">{props.error}</div>}
          <div className="v2-project-list">
            {props.loading && <div className="v2-empty">正在读取项目...</div>}
            {!props.loading && props.projects.length === 0 && <div className="v2-empty"><FolderOpen size={24} /><span>还没有项目</span></div>}
            {props.projects.map((project) => (
              <button className="v2-project-row" type="button" key={project.id} onClick={() => props.onOpen(project.id)}>
                <span className="v2-project-row__mark"><FolderOpen size={18} /></span>
                <span className="v2-project-row__main"><strong>{project.name}</strong><small>{project.description || 'AI 图像工作流'}</small></span>
                <span className="v2-project-row__time"><Clock3 size={14} />{relativeTime(project.updated_at)}</span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </section>

        <section className="v2-hub__section">
          <div className="v2-section-heading"><div><h2>模板</h2><span>直接创建完整工作流</span></div></div>
          <div className="v2-template-grid">
            {props.templates.map((template) => (
              <button className={`v2-template-card v2-template-card--${template.accent || 'violet'}`} type="button" key={template.id} onClick={() => props.onTemplate(template.id)}>
                <span className="v2-template-card__art"><Sparkles size={25} /></span>
                <span className="v2-template-card__content"><small>{template.category}</small><strong>{template.name}</strong><span>{template.description}</span></span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
