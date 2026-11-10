const fs = require('fs');
const { MAX_BYTE_SIZE, MASTER_ALLOWLIST } = require('../utils/state');
const {byteSizeHandler} = require('../utils/responses')
const path = require('path');
const crypto = require('crypto');

class multipartStreamParser {
    constructor(req, res) {
        this.req = req;
        this.res = res;
        this.accumulationBuffer = Buffer.alloc(0);
        this.parsedFields = {};
        this.activeFieldName = null;
        this.isFile = false;
        this.activeFileStream = null;
        this.activeFilePath = null;
        this.activeFileSize = 0;
        this.fileID = null;
        const contentType = this.req.headers['content-type'];
        const match = contentType ? contentType.match(/boundary=(.+)/) : null;
        this.boundaryMarker = match ? Buffer.from(`--${match[1]}`) : null;
        this.currentState = 'READING_BOUNDARY';        
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    startParsing() {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            let dataLength = 0;

            this.req.on('data', (chunk) => {
                dataLength += chunk.length;
                if(dataLength > MAX_BYTE_SIZE) {
                    byteSizeHandler(this.req, this.res);
                    this.rejectPromise(new Error('Payload execution limit exceeded'));
                    return;
                }

                this.accumulationBuffer = Buffer.concat([this.accumulationBuffer, chunk]);

                this._runStateEngine();
            });

            this.req.on('error', (err) => {
                this.rejectPromise(err);
            });
        });
    }

    _runStateEngine() {
        let processing = true;
        while(processing) {
            if(this.currentState === 'READING_BOUNDARY') {
                this.currentState = 'READING_HEADERS';
            }

            else if(this.currentState === 'READING_HEADERS') {
                const headerGap = Buffer.from('\r\n\r\n');
                const headerGapIndex = this.accumulationBuffer.indexOf(headerGap);

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
                        const ext = path.extname(cleanFileName).toLowerCase();

                        if(!this._checkExtName(ext)) {
                            this.currentState = 'FINISHED';
                            processing = false;
                            break;
                        }
                        //generate unique ID
                        this.fileID = `${crypto.randomUUID()}${ext}`;
                        this.activeFilePath = path.join(__dirname, `../uploads/temp/ZFA-${this.fileID}`);
                        this.activeFileStream = fs.createWriteStream(this.activeFilePath);
                    } else {
                        this.isFile = false;
                        this.activeFileStream = null;
                        this.activeFilePath = null;
                        this.fileID = null;
                    }

                    this.accumulationBuffer = this.accumulationBuffer.subarray(headerGapIndex + headerGap.length);
                    this.currentState = 'READING_BODY';

                } else {
                    processing = false;
                }
            }

            else if(this.currentState === 'READING_BODY') {
                const nextBoundaryIndex = this.accumulationBuffer.indexOf(this.boundaryMarker);
                let bodyBytes;

                if(nextBoundaryIndex !== -1) {
                    bodyBytes = this.accumulationBuffer.subarray(0, nextBoundaryIndex - 2);
                    if(this.isFile) {
                        this.currentState = 'WRITING_BODY'
                        this.activeFileSize = bodyBytes.length; 
                        this.activeFileStream.write(bodyBytes);
                        processing = false;
                        this.activeFileStream.end(() => {
                            this.parsedFields[this.activeFieldName] = 'file saved successfully...';
                            this._lookAhead(nextBoundaryIndex);
                            this._runStateEngine()
                        });
                        break;
                    } else {
                        this.parsedFields[this.activeFieldName] = bodyBytes.toString('utf-8');
                        this._lookAhead(nextBoundaryIndex)
                    }
                    
                } else {
                    processing = false;
                }

            }

            else if(this.currentState === 'WRITING_BODY') {
                processing = false
            }
            
            else if (this.currentState === 'FINISHED') {
                processing = false;
            } else {
                this.rejectPromise(new Error('Invalid state machine engine sequence'));
                processing = false;
            }
        }
    }

    _lookAhead(nextBoundaryIndex) {
        const extraBytesCalc = nextBoundaryIndex + this.boundaryMarker.length;
        const lookAhead = this.accumulationBuffer.subarray(extraBytesCalc, extraBytesCalc + 2);

        if(lookAhead && lookAhead.toString() === '--') {
            this.currentState = 'FINISHED';
            this.accumulationBuffer = Buffer.alloc(0);

            this.resolvePromise({
                filepath: this.activeFilePath,
                id: this.fileID,
                size: this.activeFileSize,
                // fields: this.parsedFields,

            })
        } else {
            this.accumulationBuffer = this.accumulationBuffer.subarray(extraBytesCalc + 2);
            this.currentState = 'READING_HEADERS'
        }
    }

    _checkExtName(ext) {
        const validExt = MASTER_ALLOWLIST.includes(ext)
        if(!validExt) {
           this.rejectPromise(new Error('Unexpected file format'));
           return false;
        }  
        return true      
    }
}


module.exports = multipartStreamParser;
