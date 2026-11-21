const { status200 } = require("../utils/responses");
const { WORKOUTS_DB, WORKOUTS_DB_FILE, USERS_DB } = require("../utils/state");
const {getRequestData, sanitizeWorkoutLogs} = require('../utils/parser');
const crypto = require('crypto');
const { writeToDB } = require("../utils/db");
const AppError = require("../middleware/AppError");

async function getWorkouts(req, res) {
    const {user} = req;
    let workouts = [];
    let deleted = false;
    for(const [_, workout] of Object.entries(WORKOUTS_DB)) {
        const sharedItem = workout.sharedWith.find(item => {
           return item.id === user.id
        });
        if(workout.author.authorId === user.id  || sharedItem){
            if(!sharedItem) {
                workouts.push(workout); 
                continue;
            }
            //if shareditem, check expiry
            const isExpired = (Date.now() - sharedItem.createdAt) > sharedItem.lifespan;
            if(isExpired) {
                const index = workout.sharedWith.findIndex(item => item.id === user.id);
                workout.sharedWith.splice(index, 1);
                deleted = true;
                continue;
            }
            workouts.push(workout);
        }  
    }
    if(deleted) {
        await writeToDB(WORKOUTS_DB_FILE, WORKOUTS_DB)
    }
    return status200(res, () => {
        return JSON.stringify({success: true, workouts});
    });
}

async function createWorkout(req, res) {
    const {user} = req;
    const {title, date, duration, effort, exercises, notes} = await sanitizeWorkoutLogs(req, res);
    const id = crypto.randomUUID();
    const workout = {
        id,
        title,
        date,
        author: {
            authorId: user.id,
            authorName: user.name
        },
        duration,
        effort,
        exercises,
        notes,
        sharedWith: []
    }
    WORKOUTS_DB.push(workout);
    await writeToDB(WORKOUTS_DB_FILE, WORKOUTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'workout created successfully'});
    })
}

async function editWorkout(req, res) {
    const {user, params} = req;
    const workout = WORKOUTS_DB.find(w => w.id === params.id);
    if(!workout) {
        throw new AppError(404, 'resource not found...')
    }
    const result = await sanitizeWorkoutLogs(req, res);
    Object.assign(workout, result);
    await writeToDB(WORKOUTS_DB_FILE, WORKOUTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: ' workout updated successfully'})
    })
}
async function getSingleWorkout(req, res) {
    const {params, user} = req;
    const workout = WORKOUTS_DB.find(w => w.id === params.id);
    if(!workout) {
        throw new AppError(404, 'Resource not found');
    }
    //authenticate...
    if(!workout.sharedWith.shareInfo.id === user.id || user.id !== workout.author.authorId) {
        throw new AppError(403, 'Forbidden access to resource')
    }
    return status200(res, () => {
        return JSON.stringify({success: true, workout})
    })
}

async function deleteWorkout(req, res) {
    const {params} = req;
    const workout = WORKOUTS_DB.find(w => w.id === params.id);
    if(!workout) {
        throw new AppError(404, 'Resource not found');
    }
    const index = WORKOUTS_DB.findIndex(w => w.id === params.id);
    if(index === -1) {
        throw new AppError(404, 'Resource not found')
    }
    WORKOUTS_DB.splice(index, 1);
    await writeToDB(WORKOUTS_DB_FILE, WORKOUTS_DB);
    return status200(res, () => {
        return JSON.stringify({success: true, message: 'Workout deleted Successfully'})
    })
}

//share
async function shareWorkout(req, res) {
    const {params} = req;
    const {id} = params;
    const data = await getRequestData(req,res);
    console.log(data)
    const {userId, lifespan} = JSON.parse(data);
    const user = USERS_DB.find(user => user.id === userId);
    if(!user) {
        throw new AppError(404, 'User not found');
    }
    const workout = WORKOUTS_DB.find(w => w.id === id);
    if(!workout) {
        throw new AppError(404, 'Resource not found')
    }
    if(!workout.sharedWith) {
        workout.sharedWith = [];
    }
    const shareInfo = {
        id: userId,
        createdAt: Date.now(),
        lifespan: lifespan
    }
    workout.sharedWith.push(shareInfo);
    await writeToDB(WORKOUTS_DB_FILE, WORKOUTS_DB);
     
    return status200(res, () => {
        JSON.stringify({success: true, message: 'Workout Shared successfully'});
    })
}

async function getSharedWorkout(req, res) {
    const {params} = req
    const workout = WORKOUTS_DB.find(w => w.id === params.id)
    status200(res, ()=> {
        return JSON.stringify({success: true, workout})
    })
}

module.exports = {getWorkouts, createWorkout, editWorkout, getSingleWorkout, deleteWorkout, shareWorkout, getSharedWorkout}