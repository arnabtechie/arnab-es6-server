import crypto from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import User from './../models/userModel.js';
import { check, validationResult } from 'express-validator';
import catchAsync from './../utils/catchAsync.js';
import AppError from './../utils/appError.js';
import Email from './../utils/email.js';

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

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: user
  });
};


export default {
  signup: catchAsync(async (req, res, next) => {
    // console.log(req.body);
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
  
    const url = `${req.protocol}://${req.get('host')}/me`;
    // console.log(url);
    new Email(newUser, url).sendWelcome();
  
    createSendToken(newUser, 201, req, res);
  }),
  
  login: catchAsync(async (req, res, next) => {
    const errors = validationResult(req);
    // console.log(errors);
    if (!errors.isEmpty()){
      return res.status(400).send({
        status: 'fail',
        error: errors
      })
    }  
    const { username, password } = req.body;
  
    // 1) Check if email and password exist
    if (!username || !password) {
      return next(new AppError('Please provide username and password!', 400));
    }
    // 2) Check if user exists && password is correct
    const user = await User.findOne({ username }).select('+password');
  
    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(400).send({
        status: 'fail',
        message: 'invalid username  or password'
      })
    }
  
    // 3) If everything ok, send token to client
    createSendToken(user, 200, req, res);
  }),
  
  logout: (req, res) => {
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });
    res.status(200).json({ status: 'success' });
  },
  
  protect: catchAsync(async (req, res, next) => {
    // 1) Getting token and check of it's there
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
      return next(
        new AppError('You are not logged in! Please log in to get access.', 401)
      );
    }
  
    // 2) Verification token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(
        new AppError(
          'The user belonging to this token does no longer exist.',
          401
        )
      );
    }
  
    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new AppError('User recently changed password! Please log in again.', 401)
      );
    }
  
    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    res.locals.user = currentUser;
    next();
  }),
  
  // Only for rendered pages, no errors!
  isLoggedIn: async (req, res, next) => {
    if (req.cookies.jwt) {
      try {
        // 1) verify token
        const decoded = await promisify(jwt.verify)(
          req.cookies.jwt,
          process.env.JWT_SECRET
        );
  
        // 2) Check if user still exists
        const currentUser = await User.findById(decoded.id);
        if (!currentUser) {
          return next();
        }
  
        // 3) Check if user changed password after the token was issued
        if (currentUser.changedPasswordAfter(decoded.iat)) {
          return next();
        }
  
        // THERE IS A LOGGED IN USER
        res.locals.user = currentUser;
        return next();
      } catch (err) {
        return next();
      }
    }
    next();
  },
  
  forgotPassword: catchAsync(async (req, res, next) => {
    // 1) Get user based on POSTed email
    const user = await User.findOne({ username: req.body.username });
    if (!user) {
      return res.status(400).send({
        status: 'fail', 
        error: 'there is no user with username'
      })
    }
  
    // 2) Generate the random reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
  
    // 3) Send it to user's email
    try {
      const resetURL = `${req.protocol}://${req.get(
        'host'
      )}/api/v1/users/resetPassword/${resetToken}`;
      await new Email(user, resetURL).sendPasswordReset();
  
      return res.status(200).json({
        status: 'success',
        message: 'Token sent to email!'
      });
    } catch (err) {
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
    // 1) Get user based on the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');
  
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
  
    // 2) If token has not expired, and there is user, set the new password
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
  
    // 3) Update changedPasswordAt property for the user
    // 4) Log the user in, send JWT
    createSendToken(user, 200, req, res);
  }),
}