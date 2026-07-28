import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { V2CanvasContext } from '../v2/CanvasContext';
import { dataUrlToImageFile } from '../v2/V2Canvas';
import { ImageCollectionPicker, ImagePicker } from '../v2/V2Node';

function canvasValue(uploadImage: (file: File, kind?: string) => Promise<string>) {
  return {
    projectId: 'project-1',
    outputs: {},
    imageModels: [],
    chatModels: [],
    updateNode: vi.fn(),
    uploadImage,
    openImage: vi.fn(),
    editMask: vi.fn(),
  };
}

describe('V2 图片输入', () => {
  it('拖放后立即预览，并在上传完成后保存素材地址', async () => {
    let finishUpload: ((url: string) => void) | undefined;
    const uploadImage = vi.fn(() => new Promise<string>((resolve) => { finishUpload = resolve; }));
    const onChange = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const { container } = render(
      <V2CanvasContext.Provider value={canvasValue(uploadImage)}>
        <ImagePicker label="选择图片" onChange={onChange} />
      </V2CanvasContext.Provider>,
    );

    const picker = container.querySelector('.v2-image-picker') as HTMLElement;
    const file = new File(['image'], 'sample.png', { type: 'image/png' });
    fireEvent.drop(picker, { dataTransfer: { files: [file] } });

    expect(screen.getByAltText('选择图片').getAttribute('src')).toBe('blob:local-preview');
    expect(uploadImage).toHaveBeenCalledWith(file, 'image');

    finishUpload?.('https://xfs.example/sample.png');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://xfs.example/sample.png'));
    expect(screen.getByAltText('选择图片').getAttribute('src')).toBe('https://xfs.example/sample.png');
  });

  it('图片组会批量上传并按选择顺序保存', async () => {
    const uploadImage = vi.fn(async (file: File) => `https://xfs.example/${file.name}`);
    const onChange = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const { container } = render(
      <V2CanvasContext.Provider value={canvasValue(uploadImage)}>
        <ImageCollectionPicker urls={['https://xfs.example/existing.png']} incomingUrls={[]} onChange={onChange} />
      </V2CanvasContext.Provider>,
    );

    const collection = container.querySelector('.v2-image-collection') as HTMLElement;
    const fileInput = collection.querySelector('input[type="file"]') as HTMLInputElement;
    const inputClick = vi.spyOn(fileInput, 'click');
    fireEvent.click(screen.getByRole('button', { name: '添加图片' }));
    expect(inputClick).toHaveBeenCalledOnce();

    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.webp', { type: 'image/webp' });
    fireEvent.drop(collection, { dataTransfer: { files: [first, second] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      'https://xfs.example/existing.png',
      'https://xfs.example/first.png',
      'https://xfs.example/second.webp',
    ]));
  });

  it('把编辑器生成的 Data URL 转为可上传蒙版文件', async () => {
    const file = dataUrlToImageFile('data:image/png;base64,aGVsbG8=', 'mask.png');
    expect(file.name).toBe('mask.png');
    expect(file.type).toBe('image/png');
    expect(await file.text()).toBe('hello');
  });
});
