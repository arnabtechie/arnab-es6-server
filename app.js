import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import AppError from './utils/appError.js';
import apiRoutes from './routes/apiRoutes.js';
import globalErrorHandler from './controllers/errorController.js';

const app = express();

const server = http.createServer(app);

const io = new Server(server, {cors: {origin: '*'}});

app.enable('trust proxy');

app.use(cors('*'));

const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public')));

app.use(helmet());

if (process.env.NODE_ENV === 'development'){
  app.use(morgan('combined'));
} else if (process.env.NODE_ENV === 'production'){
  app.use(morgan('tiny'));
} else {
  app.use(morgan('combined'));
}

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 10000,
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

app.use(mongoSanitize());

app.use(xss());

app.use(compression());

app.use('/api/v1', apiRoutes);

app.use(globalErrorHandler);

app.use((req, res, next) => {
  return res.status(404).send({status: 'fail', errors: '404 not found'});
});

io.use((socket, next) => {
  if (socket.handshake.query && socket.handshake.query.token){
      jwt.verify(socket.handshake.query.token, config.SECRET_KEY, (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.id = decoded._id;
      next();
      });
  }
  else {
      next(new Error('Authentication error'));
  }
});

io.on('connection', async (socket, next) => {
  console.log('socket connected...');

  socket.on('connect', async (data) => {
    console.log('user connected...')
  })
})

export default app;