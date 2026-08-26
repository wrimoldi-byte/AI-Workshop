import {status} from './_core.js';
export default function handler(req,res){res.status(200).json(status());}
