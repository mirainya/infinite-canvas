import { registerNodeBody } from '../registry';
import ImageEditBody from './ImageEditBody';
import ImageComposeBody from './ImageComposeBody';

registerNodeBody('image-edit', ImageEditBody);
registerNodeBody('image-compose', ImageComposeBody);
