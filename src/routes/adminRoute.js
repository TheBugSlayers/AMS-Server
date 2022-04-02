const express = require("express")
const router = new express.Router()
const adminCtrl = require('../controllers/admin.controllers')
const authToken   = require('../middlewares/authMiddleware')
const  {isAdmin}  = require('../middlewares/roleMiddleware')

router.get("/",async(req,res,)=>{
    res.send("from admin")
})

// see all manager
router.get("/managerList",[authToken,isAdmin], adminCtrl.managerList) 

// for changing manager status
router.post('/setManagerStatus', [authToken, isAdmin], adminCtrl.setManagerStatus)

// Accepted manager list
router.get("/acceptedList", [authToken, isAdmin], adminCtrl.acceptedList)

// Rejected manager list
router.get("/rejectedList", [authToken, isAdmin], adminCtrl.rejectedList)

// Remove User By Id
router.get("/removeUser:userId", [authToken, isAdmin], adminCtrl.removeUserById)

// return all users
router.get("/allUsers", [authToken, isAdmin], adminCtrl.allUsers)

module.exports= router


