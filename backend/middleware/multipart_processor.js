const fs = require('fs');
const { MAX_BYTE_SIZE } = require('../utils/state');
const { byteSizeHandler } = require('../utils/app');

class multipartStreamParser {
    constructor(req, res) {
        this.req = req;
        this.res = res;
        this.accumulationBuffer = Buffer.alloc(0);
        this.parsedFields = {};
        this.activeFieldName = null;
        this.isFile = false;
        this.activeFileStream = null;
        const contentType = this.req.headers['content-type'];
        const match = contentType ? contentType.match(/boundary=(.+)/) 
        : null;
        this.boundaryMarker = match ? Buffer.from(`--${match[1]}`)
        : null;
        this.currentState = 'READING_BOUNDARY'
    }

    startParsing() {
        let dataLength = 0
        this.req.on('data', (chunk) => {
            //guard for massive payloads
            dataLength += chunk.length;
            if(dataLength > MAX_BYTE_SIZE) {
                byteSizeHandler(this.req, this.res);
                return;
            }

            this.accumulationBuffer = Buffer.concat([this.accumulationBuffer, chunk]);
            console.log('======= Current Buffer size:', this.accumulationBuffer.length / 1024, 'kb');

            this._runStateEngine()
        })
    }

    _runStateEngine() {
        let processing = true;
        while(processing) {
            if(this.currentState === 'READING_BOUNDARY') {
                this.currentState = 'READING_HEADERS';
            }

            else if(this.currentState === 'READING_HEADERS') {
                const headerGapMarker = Buffer.from('\r\n\r\n');
                const headerGapIndex = this.accumulationBuffer.indexOf(headerGapMarker);

                if(headerGapIndex !== -1) {
                    const headerText = this.accumulationBuffer.subarray(0, headerGapIndex).toString('utf-8');
                    const nameMatch = headerText.match(/name="([^"]+)"/);
                    if(nameMatch) {
                        this.activeFieldName = nameMatch[1];
                    }

                    const fileNameMatch = headerText.match(/filename="([^"]+)"/);
                    if(fileNameMatch) {
                        this.isFile = true;
                        const cleanFileName = fileNameMatch[1];
                        this.activeFileStream = fs.createWriteStream(`../uploads/ZFA-${cleanFileName}`);
                        console.log('filestream opened for writing...');
                    } else {
                        this.isFile = false;
                        this.activeFileStream = null;
                    }

                    //trim the header text out of the buffer
                    this.accumulationBuffer = this.accumulationBuffer.subarray(headerGapIndex + headerGapMarker.length);
                    console.log('buffer tank cleared. remaining bytes:', this.accumulationBuffer.length / 1024, 'kb\n');

                    this.currentState = 'READING_BODY';
                    console.log('state changed to:', this.currentState);
                } else {
                    processing = false;
                }
            }

            else if(this.currentState === 'READING_BODY') {
                console.log('[STATE:READING_BODY] scanning network for incoming body data')
                const nextBoundaryIndex = this.accumulationBuffer.indexOf(this.boundaryMarker);

                if(nextBoundaryIndex !== -1) {
                    const bodyBytes = this.accumulationBuffer.subarray(0, nextBoundaryIndex - 2);

                    if(this.isFile) {
                        //open write stream
                        this.activeFileStream.write(bodyBytes);
                        this.activeFileStream.end();
                        this.parsedFields[this.activeFieldName] = 'file saved successfully'
                    } else {
                        this.parsedFields[this.activeFieldName] = bodyBytes.toString('utf-8');
                    }

                    const extraBytesCalc = nextBoundaryIndex + this.boundaryMarker.length;
                    const lookAhead = this.accumulationBuffer.subarray(extraBytesCalc, extraBytesCalc + 2);

                    if(lookAhead && lookAhead.toString() === '--') {
                        console.log('final boundary reached');
                        this.currentState = 'FINISHED';
                        this.accumulationBuffer = Buffer.alloc(0);
                        processing = false;
                    } else {
                        this.accumulationBuffer = this.accumulationBuffer.subarray(extraBytesCalc + 2);
                        this.currentState = 'READING_HEADERS'
                    }
                } else {
                    console.log('next boundary not found');
                    processing = false;
                }
            }
        }
    }

}