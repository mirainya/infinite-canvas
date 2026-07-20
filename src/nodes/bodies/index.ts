import { registerNodeBody } from '../registry';
import ImageEditBody from './ImageEditBody';
import ImageComposeBody from './ImageComposeBody';
import ImagePreviewBody from './ImagePreviewBody';
import ImageUploadBody from './ImageUploadBody';
import TextBoxBody from './TextBoxBody';

registerNodeBody('image-edit', ImageEditBody);
registerNodeBody('image-compose', ImageComposeBody);
registerNodeBody('image-preview', ImagePreviewBody);
registerNodeBody('image-upload', ImageUploadBody);
registerNodeBody('text-box', TextBoxBody);
