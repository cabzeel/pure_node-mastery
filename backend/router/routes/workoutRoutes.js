const { getWorkouts, createWorkout, editWorkout, getSingleWorkout, deleteWorkout, shareWorkout, getSharedWorkout } = require("../../controllers/workoutsController");
const extractTokenAndUser = require("../../middleware/extractTokenAndUser");

function workoutRoutes(router) {
    router.get('/api/workouts', extractTokenAndUser, getWorkouts);
    router.post('/api/workouts', extractTokenAndUser, createWorkout);
    router.get('/api/workouts/:id', extractTokenAndUser, getSingleWorkout);
    router.patch('/api/workouts/:id', extractTokenAndUser, editWorkout);
    router.delete('/api/workouts/:id', extractTokenAndUser, deleteWorkout);
    //share
    router.post('/api/workouts/:id/share', extractTokenAndUser, shareWorkout);
    router.get('/api/workouts/:id/share', extractTokenAndUser, getSharedWorkout);

}
module.exports = workoutRoutes