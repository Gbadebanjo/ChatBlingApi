import { Schema, model } from 'mongoose';

const MessageSchema = new Schema({
sender: {type: Schema.Types.ObjectId, ref: 'User', required: true,},
recipient: {type: Schema.Types.ObjectId, ref: 'User', text: String, required: true,},
text: { type: String, required: true },
}, { timestamps: true });

const MessageModel = model('Message', MessageSchema);

export default MessageModel;