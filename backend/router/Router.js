const errorHandler = require("../middleware/errorHandler");

class Router {
    constructor() {
        this.routes = [];
        this.base = 'http://localhost:3000'
    }
    
    register(method, path, ...handlers) {
        if(typeof method !== 'string' || method === '' ) {
            throw new Error('Method must be a non empty string')
        }

        if(typeof path !== 'string' || path.trim() === '') {
            throw new Error('path must be a non empty string');
        }
        if(handlers.length < 1) {
            throw new Error('missing handler parameter')
        }
        if(!handlers.every(handler => typeof handler === 'function')){
            throw new Error('Unexpected arg type. ')
        }
        const route = {
            method: method.toUpperCase(),
            path: path,
            handlers: [...handlers]
        }
        this.routes.push(route)

    }

    post(path, ...handlers) {
        this.register('POST', path, ...handlers)
    }

    get(path, ...handlers) {
        this.register('GET', path, ...handlers);
    }
    patch(path, ...handlers) {
        this.register('PATCH', path, ...handlers)
    }

    delete(path, ...handlers) {
        this.register('DELETE', path, ...handlers);
    }
    match(method, path) {
        //find match
        const match = this.routes.find(route => route.method.toUpperCase() === method && this.matchPath(route.path, path));
        if(!match) {
            return undefined
        }
        return match;
    }

    matchPath(routePath, requestPath) {
        const routeArr = routePath.split('/');
        const requestArr = requestPath.split('/')
        if(routeArr.length !== requestArr.length) {
            return false
        }
        for(let i = 0; i < routeArr.length; i++) {
            if(routeArr[i].startsWith(':')) {
                continue;
            }
            if(routeArr[i] !== requestArr[i]) {
                return false;
            }
        }
        return true;
    }

    extractParams(routePath, requestPath) {
        const routeArr = routePath.split('/');
        const requestArr = requestPath.split('/');
        if(routeArr.length !== requestArr.length) {
            throw new Error('Error: invalid route');
        }
        let result = {}
        for(let i = 0; i < routeArr.length; i++) {
            if(routeArr[i].startsWith(':')) {
                result[routeArr[i].slice(1)] = requestArr[i]
            }
        }
        return result;
    }

    extractQuery(requesturl) {
        const url = new URL(requesturl, this.base);
        const result = Object.fromEntries(url.searchParams);
        return result;
    }

    runHandlers(handlers, req, res) {
        let index = 0;
        async function next() {
            try {
                const handler = handlers[index];
                index++;

                if(!handler) return;

                let nextCalled = false;
                function nextHandler() {
                    if(nextCalled) {
                        throw new Error('next() called multiple times');
                    }
                    nextCalled = true;
                    next()
                }
                 await handler(req, res, nextHandler);
            } catch (error) {
                return errorHandler(error, req, res);
            }
        }
        next();
    }

    handle(req, res) {
        const url = new URL(req.url, this.base);
        const pathname = url.pathname
        const route = this.match(req.method, pathname);

        if(!route) {
            res.statusCode = 404;
            res.end('Route not found');
            return;
        }
        req.params = this.extractParams(route.path, pathname);
        req.query = this.extractQuery(req.url);
        this.runHandlers(route.handlers, req, res);
        
    }
}

module.exports = Router;