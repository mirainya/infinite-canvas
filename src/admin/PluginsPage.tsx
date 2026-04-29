import { useEffect, useState } from 'react';
import { authHeaders } from '../components/LoginPage';

type PluginInfo = {
  def_id: string;
  name: string;
  category: string;
  inputs: number;
  outputs: number;
  controls: number;
};

export function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/plugins', { headers: authHeaders() })
      .then((r) => r.json())
      .then(setPlugins)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__loading">加载中...</div>;

  return (
    <div>
      <h1 className="admin__title">插件管理</h1>
      {plugins.length === 0 ? (
        <div className="admin__empty">暂无已加载插件</div>
      ) : (
        <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>分类</th>
              <th>输入</th>
              <th>输出</th>
              <th>控件</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((p) => (
              <tr key={p.def_id}>
                <td><code>{p.def_id}</code></td>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>{p.inputs}</td>
                <td>{p.outputs}</td>
                <td>{p.controls}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
