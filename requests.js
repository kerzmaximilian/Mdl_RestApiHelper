const _ = require("lodash");
const jwt_decode = require('jwt-decode');
const config = require('../config.json');
const httpCodes = require('./httpCodes.json');
const ENVIRONMENT = process.env.ENVIRONMENT;


/**
 * Extract allowed params from request
 * @param {any} req 
 * @param {object} allowedParams 
 * @returns 
 */
 exports.extractParameters = (req, allowedParams) => {
    const params = getParameters(req)
    const paramsKeys = params ? Object.keys(params) : []

    let extractedParams = {}
    for (const key of paramsKeys) {
        const validatedKey = parseParameter(key, allowedParams)
        const validatedValue = evaluateParamValue(params[validatedKey], validatedKey)
        if(validatedKey && validatedValue) extractedParams[validatedKey] = validatedValue
    }
    if(allowedParams.includes("limit") && extractedParams["limit"] === undefined) extractedParams["limit"] = 20
    if(allowedParams.includes("limit") && extractedParams["limit"] > 50) extractedParams["limit"] = 50
    if(allowedParams.includes("offset") && extractedParams["offset"] === undefined) extractedParams["offset"] = 0
    return extractedParams
} 

/**
 * Extracts user id from auth JWT token if present
 * @param {object} req 
 * @returns 
 */
 exports.extractUserId = (req) => {
    let userId = ''
    try {
        const bearerToken = req.headers.authorization
        if(bearerToken) {
            const token = bearerToken.split("Bearer ")[1]
            const decoded = jwt_decode(token)
            const hasAllowedAudience = config.authorization.allowedCognitoAudiences.includes(decoded.client_id)
            let isNotExpired = new Date().getTime()/1000 < parseInt(decoded.exp)

            if(ENVIRONMENT === "dev") isNotExpired = true //temporary
            if(ENVIRONMENT !== "dev" && !isNotExpired) console.warn("WARN utilBasic: Expired jwt token detected.", decoded)

            if(hasAllowedAudience && isNotExpired) userId = decoded.username
        }
    } catch (e) {
        console.warn("WARN utilBasic: Could not extract userId from auth token.")
    }
    return userId
}

/**
 * Extract body and pathparameter from request
 * @param {*} req 
 * @returns 
 */
 exports.extractPostBody = (req) => {
    let body = {}
    try {
        body = { ...req.apiGateway.event.pathParameters, ...req.body }
    } catch (e) {
        console.warn("WARN utilBasic: Could not extract body from request.")
    }
    return body
}

/**
 * Determines if the request has been initiated by a Cherry Health user.
 * @param {*} req 
 * @returns 
 */
 exports.evalUserRequestAuthentic = async (req) => {
    const userId = this.extractUserId(req)
    const primaryKeys = {
        partition: userId, 
        sort: "account" 
    }
    const results = await dyno.getObjects(primaryKeys, "Users")
    const userAccount = results.length > 0 ? results[0] : {}
    
    const requestAuthentic = userAccount["__typename"] !== undefined ? true : false
    return requestAuthentic
}


/**
 * Returns a response object with correct error formating
 * @param {string} errorName 500_INTERNAL_SERVER_ERROR by default; Choose from errors.json for full option list
 * @param {string} description optional
 * @returns {object} resObj for express
 */
 exports.createResponseObject = (body, statusName="500_INTERNAL_SERVER_ERROR", description="") => {
    let statusType = httpCodes[statusName]
    if(statusType === undefined) statusType = httpCodes["500_INTERNAL_SERVER_ERROR"]
    let resObj = { 
        statusCode: statusType.code, 
        status: statusType.message, 
        description, 
        body:{}
    }
    if(resObj.statusCode >= 200 && resObj.statusCode < 300) resObj["body"] = { ...body }
    if(resObj.statusCode >= 300 ) resObj["body"] = { status: statusType.message, description }
    return resObj
}

/**
 * A guardian wrapper which catches any issues going wrong and returns a 500 error
 * @param {function} func 
 * @param  {...any} args 
 * @returns 
 */
exports.guard = async (func, ...args) => {
    try {
        const resObj = await func(...args)
        return resObj
    } catch(e) {
        console.error(e)
        const resObj = this.createResponseObject(
            {}, 
            "500_INTERNAL_SERVER_ERROR", 
            "Guard detected a server-side malfunction."
        )
        return resObj
    }
}

//// Private support functions ////////////////////////////////////////////////////////////////////

/**
 * Retrieves parameters from request (query AND route parameters)
 * @param {object} req 
 * @returns 
 */
 const getParameters = (req) => {
    const params = {
        ...req.apiGateway.event.pathParameters,
        ...req.apiGateway.event.queryStringParameters
    }
    return params
}

/**
 * Parses only allowed parameter keys
 * @param {*} parameter 
 * @param {*} allowedArr 
 * @returns 
 */
const parseParameter = (parameter, allowedArr) => {
    if(_.includes(allowedArr, parameter)) return parameter
    return undefined
}

/**
 * Evaluates the value(s) of suuplied allowed params 
 * @param {string} value 
 * @param {string} key 
 * @returns 
 */
const evaluateParamValue = (value, key) => {
    const paramInstruction = config.params[key]
    if(paramInstruction === undefined) return undefined
    if(!paramInstruction.requiresEval) return value
    
    if(paramInstruction.type === "number") {
        try {
            const valueNumber = parseInt(value)
            return valueNumber
        } catch(e) {
            return undefined
        }
    }
    if(paramInstruction.type === "string") {
        const values = value.split("|")
        const maxIndex = paramInstruction.allowMultipleValues ? values.length : 1

        let allowedParamValues = []
        for(let i = 0; i < maxIndex; i++) {
            if(paramInstruction.allowedValues.includes(values[i])) allowedParamValues.push(values[i])
        }

        if(allowedParamValues.length === 0) return undefined
        if(!paramInstruction.allowMultipleValues) return allowedParamValues[0]
        return allowedParamValues
    }
}