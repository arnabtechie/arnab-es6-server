import express from 'express';
import { check, validationResult } from 'express-validator';
import authController from '../controllers/authController.js';

const router = express.Router();

//-----------------------------------------UnAuthenticated-------------------------------------------------//
router.post('/users/signup',
  [check('name', 'Please enter name.').not().isEmpty(),
  check('username', 'Please enter valid username').isEmail(),
  check('password', 'Please enter valid password').isLength({ min: 8 })],
  authController.signup
);
router.post('/users/login', 
  [check('username', 'Please enter valid username').isEmail(), 
  check('password', 'Please enter valid password').isLength({ min: 8 })],
  authController.login
);

router.post('/users/forgotPassword', authController.forgotPassword);
router.patch('/users/resetPassword/:token', authController.resetPassword);

//---------------------------------------------------------------------------------------------------------//

router.use(authController.protect);

//------------------------------------------Authenticated--------------------------------------------------//
router.get('/users/logout', authController.logout);


//---------------------------------------------------------------------------------------------------------//

export default router;
