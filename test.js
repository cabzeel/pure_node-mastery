const nameDB = {
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

console.log(nameDB[someName].position)