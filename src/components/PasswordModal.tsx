import { useState } from 'react';
import { apiFetch } from './LoginPage';

interface PasswordModalProps {
  onClose: () => void;
}

export default function PasswordModal({ onClose }: PasswordModalProps) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setError('');
    if (newPwd.length < 6) { setError('新密码至少6位'); return; }
    if (newPwd !== confirmPwd) { setError('两次密码不一致'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || '修改失败');
        return;
      }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal__overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal__header">
          <h3>修改密码</h3>
          <button type="button" className="profile-modal__close" onClick={onClose}>✕</button>
        </div>

        <label className="profile-modal__field">
          <span>旧密码</span>
          <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="输入旧密码" />
        </label>

        <label className="profile-modal__field">
          <span>新密码</span>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="至少6位" />
        </label>

        <label className="profile-modal__field">
          <span>确认新密码</span>
          <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="再次输入新密码" />
        </label>

        {error && <div className="profile-modal__error">{error}</div>}
        {success && <div className="profile-modal__success">密码修改成功</div>}

        <div className="profile-modal__actions">
          <button type="button" className="profile-modal__btn profile-modal__btn--cancel" onClick={onClose}>取消</button>
          <button
            type="button"
            className="profile-modal__btn profile-modal__btn--save"
            disabled={saving || !oldPwd || !newPwd || !confirmPwd}
            onClick={handleSave}
          >
            {saving ? '修改中...' : '修改密码'}
          </button>
        </div>
      </div>
    </div>
  );
}
