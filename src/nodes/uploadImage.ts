import { apiFetch } from '../api';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function uploadImageFile(file: File): Promise<string> {
  const image = await readAsDataUrl(file);
  const response = await apiFetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (!response.ok) throw new Error(`上传失败: ${response.status}`);
  const result = await response.json();
  if (!result.url) throw new Error('上传未返回图片地址');
  return result.url;
}
