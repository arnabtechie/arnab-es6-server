import crypto from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import User from './../models/userModel.js';
import { check, validationResult } from 'express-validator';
import catchAsync from './../utils/catchAsync.js';
import AppError from './../utils/appError.js';
import mailer from './../utils/email.js';

const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  });

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: user
  });
};


export default {
  signup: catchAsync(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()){
      return res.status(400).send({
        status: 'fail',
        error: errors
      })
    }  
    const newUser = await User.create({
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
      passwordConfirm: req.body.passwordConfirm
    });
  
    mailer('welcomeMaiil')(user.username, {
      NAME: user.name,
    }).send();
  
    createSendToken(newUser, 201, req, res);
  }),
  
  login: catchAsync(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()){
      return res.status(400).send({
        status: 'fail',
        error: errors
      })
    }  
    const { username, password } = req.body;
  
    if (!username || !password) {
      return res.status(400).send({
        status: 'fail',
        errors: 'please send username and password'
      })
    }
    const user = await User.findOne({ username }).select('+password');
  
    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(400).send({
        status: 'fail',
        message: 'invalid username or password'
      })
    }
  
    createSendToken(user, 200, req, res);
  }),
  
  logout: catchAsync(async (req, res) => {
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });
    res.status(200).json({ status: 'success' });
  }),
  
  protect: catchAsync(async (req, res, next) => {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }
  
    if (!token) {
      return res.status(401).send({
        status: 'fail',
        error: 'you are not logged in! please log in to get access'
      })
    }
  
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).send({
        status: 'fail',
        message: 'user belonging to this token does no longer exist'
      });
    }
  
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).send({
        status: 'fail',
        message: 'user recently changed password! please log in again'
      });
    }
  
    req.user = currentUser;
    res.locals.user = currentUser;
    next();
  }),
  
  isLoggedIn: catchAsync(async (req, res, next) => {
    if (req.cookies.jwt) {
      try {
        const decoded = await promisify(jwt.verify)(
          req.cookies.jwt,
          process.env.JWT_SECRET
        );
  
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
          return next();
        }
  
        if (currentUser.changedPasswordAfter(decoded.iat)) {
          return next();
        }
  
        res.locals.user = currentUser;
        return next();
      } catch (err) {
        return next();
      }
    }
    next();
  }),
  
  forgotPassword: catchAsync(async (req, res, next) => {
    const user = await User.findOne({ username: req.body.username });
    if (!user) {
      return res.status(400).send({
        status: 'fail', 
        error: 'there is no user with username'
      })
    }
  
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
  
    try {
      const resetURL = `${req.protocol}://${req.get(
        'host'
      )}/api/v1/users/resetPassword/${resetToken}`;

      mailer('forgotPasswordMail')(user.username, {
        NAME: user.name,
        LINK: resetURL
      }).send();

      return res.status(200).json({
        status: 'success',
        message: 'Token sent to email!'
      });
    } catch (err) {
      console.log(err);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
  
      return res.status(400).send({
        status: 'fail',
        error: err
      })
    }
  }),
  
  resetPassword: catchAsync(async (req, res, next) => {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');
  
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
  
    if (!user) {
      return res.status(400).send({
        status: 'fail',
        error: 'Token is invalid or has expired'
      })
    }
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
  
    createSendToken(user, 200, req, res);
  }),
}