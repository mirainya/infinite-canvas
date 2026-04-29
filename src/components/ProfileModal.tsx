import { useState, useRef } from 'react';
import { apiFetch, setUserInfo } from './LoginPage';

interface ProfileModalProps {
  nickname: string;
  avatar: string;
  onClose: () => void;
  onSaved: (info: { nickname: string; avatar: string }) => void;
}

export default function ProfileModal({ nickname: initNickname, avatar: initAvatar, onClose, onSaved }: ProfileModalProps) {
  const [nickname, setNickname] = useState(initNickname);
  const [avatar, setAvatar] = useState(initAvatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      setError('头像不能超过 512KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, avatar }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || '保存失败');
        return;
      }
      setUserInfo({ nickname, avatar });
      onSaved({ nickname, avatar });
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
          <h3>修改资料</h3>
          <button type="button" className="profile-modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="profile-modal__avatar-section">
          <div className="profile-modal__avatar" onClick={() => fileRef.current?.click()}>
            {avatar ? (
              <img src={avatar} alt="头像" />
            ) : (
              <span className="profile-modal__avatar-placeholder">👤</span>
            )}
            <div className="profile-modal__avatar-overlay">更换</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>

        <label className="profile-modal__field">
          <span>昵称</span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="设置昵称"
            maxLength={20}
          />
        </label>

        {error && <div className="profile-modal__error">{error}</div>}

        <div className="profile-modal__actions">
          <button type="button" className="profile-modal__btn profile-modal__btn--cancel" onClick={onClose}>取消</button>
          <button type="button" className="profile-modal__btn profile-modal__btn--save" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
