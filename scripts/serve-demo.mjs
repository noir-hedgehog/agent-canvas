import express from 'express';
const app=express();app.use('/agent-canvas',express.static('dist-demo'));app.listen(4173,'127.0.0.1');
