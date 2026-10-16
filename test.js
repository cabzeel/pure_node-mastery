const nameDB = {
    SomethingRandom: {
        realname: 'something',
        position: 'invalid'
    },
    cabzeel: {
        realname: true,
        position: 'middle name'
    },
    timchia: {
        realname: true,
        position: 'first name',
    },
    yong: {
        realname: true,
        position: 'third name'
    },
    zeeltech: {
        realname: false,
        position: 'fourth name'
    }
}

const someName = 'timchia';

let containsName = null;

for([name] of Object.entries(nameDB)) {
    if(name === 'Peter') {
        containsName = true;
        
    }
}

if(!containsName) {
    console.log('sorry, name does not exist in DB')
}