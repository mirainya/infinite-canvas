import { registerNodeBody } from '../registry';
import ImageEditBody from './ImageEditBody';
import ImageComposeBody from './ImageComposeBody';
import ImageGenBody from './ImageGenBody';
import ImageGroupBody from './ImageGroupBody';
import ImagePreviewBody from './ImagePreviewBody';
import ImageUploadBody from './ImageUploadBody';
import TextBoxBody from './TextBoxBody';

registerNodeBody('image-edit', ImageEditBody);
registerNodeBody('image-compose', ImageComposeBody);
registerNodeBody('image-gen', ImageGenBody);
registerNodeBody('image-group', ImageGroupBody);
registerNodeBody('image-preview', ImagePreviewBody);
registerNodeBody('image-upload', ImageUploadBody);
registerNodeBody('text-box', TextBoxBody);
