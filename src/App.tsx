import {KukaiEmbed, LoginConfig, TypeOfLogin} from 'kukai-embed';
import React, {useEffect, useRef, useState} from 'react';
import './App.css';
import {makeExpression} from "./utils/make-expression";

enum ACTION_TYPES
{
    LOGIN = 'login',
    EXPRESSION = 'expression',
    OPERATION = 'operation',
}

const REDIRECT_DEEPLINK = 'unitydl001://';

const DEFAULT_LOGIN_LAYOUT = {
    loginOptions: [TypeOfLogin.Google, 'email' as TypeOfLogin, TypeOfLogin.Twitter],
    wideButtons: [true, true, true]
};

function getLoginLayout()
{
    const params = new URLSearchParams(decodeURIComponent(window.location.search));

    const typeOfLogin = params.get('typeOfLogin');
    const id = params.get('id') || 'sample-id';
    const nonce = params.get('nonce');

    const loginLayout = typeOfLogin ? {
        loginOptions: [typeOfLogin],
        wideButtons: [true]
    } as LoginConfig : DEFAULT_LOGIN_LAYOUT;

    return !!nonce ? {authParams: {id, nonce}, ...loginLayout} : loginLayout
}

function getAction()
{
    console.log("Full URL Search Params:", window.location.search);

    const decodedSearchParams = decodeURIComponent(window.location.search);
    console.log("Decoded URL Search Params:", decodedSearchParams);

    const params = new URLSearchParams(decodedSearchParams);
    const hasOperation = params.has(ACTION_TYPES.OPERATION);
    console.log("Has Operation:", hasOperation);

    const typeOfLogin = params.get('typeOfLogin');
    console.log("Type of Login:", typeOfLogin);

    if (hasOperation)
    {
        const operationPayload = params.get(ACTION_TYPES.OPERATION)!;
        console.log("Operation Payload (raw):", operationPayload);

        try
        {
            const parsedPayload = JSON.parse(operationPayload);
            console.log("Parsed Payload:", parsedPayload);
            return {action: ACTION_TYPES.OPERATION, payload: parsedPayload, typeOfLogin};
        } catch (error)
        {
            console.error("Error parsing JSON payload:", error);
            return {action: ACTION_TYPES.LOGIN, typeOfLogin};
        }
    }

    const hasExpression = params.has(ACTION_TYPES.EXPRESSION);

    if (hasExpression)
    {
        const expressionPayload = params.get(ACTION_TYPES.EXPRESSION)!;
        console.log("Expression Payload (raw):", expressionPayload);
        return {action: ACTION_TYPES.EXPRESSION, payload: expressionPayload, typeOfLogin};
    }

    return {action: ACTION_TYPES.LOGIN, typeOfLogin};
}

async function handleLogin(kukaiEmbed: KukaiEmbed, setRedirectUrl: React.Dispatch<React.SetStateAction<string>>)
{
    if (kukaiEmbed.user)
    {
        await kukaiEmbed.logout();
    }

    const loginLayout = getLoginLayout();

    const {pkh, pk, userData, authResponse} = await kukaiEmbed.login(loginLayout); // where pkh: tezos address 
    const {name, email} = userData as any;
    const {message, signature} = authResponse || {};

    const deeplinkUrl = encodeURI(`${REDIRECT_DEEPLINK}kukai-embed/?type=${ACTION_TYPES.LOGIN}&address=${pkh}&public_key=${pk}&name=${name}&email=${email}&message=${message}&signature=${signature}&typeOfLogin=${userData.typeOfLogin}`);
    console.log('OPENING DEEPLINK: ', deeplinkUrl);
    setRedirectUrl(deeplinkUrl);
}

async function handleSignExpression(kukaiEmbed: KukaiEmbed, payload: any, setRedirectUrl: React.Dispatch<React.SetStateAction<string>>)
{
    let pkh: string, userData: any;

    if (!kukaiEmbed.user)
    {
        const loginLayout = getLoginLayout();
        const user = await kukaiEmbed.login(loginLayout);
        pkh = user.pkh;
        userData = user.userData;

    } else
    {
        pkh = kukaiEmbed.user.pkh;
        userData = kukaiEmbed.user.userData;
    }

    const expressionToSign = makeExpression(payload);
    const operationHash = await kukaiEmbed.signExpr(expressionToSign);
    const {name, email, typeOfLogin} = userData;

    const deeplinkUrl = encodeURI(`${REDIRECT_DEEPLINK}kukai-embed/?type=${ACTION_TYPES.EXPRESSION}&address=${pkh}&name=${name}&email=${email}&typeOfLogin=${typeOfLogin}&operationHash=${operationHash}&expression=${payload}`);
    console.log('OPENING DEEPLINK: ', deeplinkUrl);
    window.location.href = deeplinkUrl;
    setRedirectUrl(deeplinkUrl);
}

async function handleOperation(kukaiEmbed: KukaiEmbed, payload: any)
{
    let pkh: string, userData: any;

    if (!kukaiEmbed.user)
    {
        const loginLayout = getLoginLayout();
        const user = await kukaiEmbed.login(loginLayout);
        pkh = user.pkh;
        userData = user.userData;
    } else
    {
        pkh = kukaiEmbed.user.pkh;
        userData = kukaiEmbed.user.userData;
    }

    const operationHash = await kukaiEmbed.send(payload);
    const {name, email, typeOfLogin} = userData;

    const deeplinkUrl = encodeURI(`${REDIRECT_DEEPLINK}kukai-embed/?type=${ACTION_TYPES.OPERATION}&address=${pkh}&name=${name}&email=${email}&typeOfLogin=${typeOfLogin}&operationHash=${operationHash}`);
    console.log('OPENING DEEPLINK: ', deeplinkUrl);
    window.location.href = deeplinkUrl;
}

function App()
{
    const [error, setError] = useState('');
    const kukaiEmbed = useRef(new KukaiEmbed({net: "https://ghostnet.kukai.app", icon: false}));
    const [redirectUrl, setRedirectUrl] = useState('');

    async function handleAction()
    {
        const {action, payload} = getAction();
        const {isBrowserOAuthCompatible} = await kukaiEmbed.current.init();

        if (!isBrowserOAuthCompatible)
        {
            throw new Error('Please continue in an external browser');
        }

        try
        {
            switch (action)
            {
                case ACTION_TYPES.OPERATION:
                {
                    await handleOperation(kukaiEmbed.current, payload);
                    break;
                }

                case ACTION_TYPES.LOGIN:
                default:
                {
                    await handleLogin(kukaiEmbed.current, setRedirectUrl);
                    break;
                }

                case ACTION_TYPES.EXPRESSION:
                {
                    await handleSignExpression(kukaiEmbed.current, payload, setRedirectUrl);
                }
            }
        } catch (error: any)
        {
            console.error('An error occurred:', error);

            let message = error?.message;
            const errorId = error?.errorId;

            if (errorId)
            {
                message += ` | Error id: ${error.errorId}`;
            }

            let deeplinkUri = `${REDIRECT_DEEPLINK}kukai-embed/?errorMessage=${message}&action=${action}`;

            if (errorId)
            {
                deeplinkUri += `&errorId=${errorId}`;
            }

            setError(`${message}`);
            console.log('Error message:', message);

            console.log('OPENING DEEPLINK: ', deeplinkUri);
            window.location.href = encodeURI(deeplinkUri);
        }
    }


    useEffect(() => {
        handleAction()
            .then()
            .catch(error => {
                setError(error?.message);
            });
    }, []);

    return <div className="parent">
        <div>KUKAI EMBED DELEGATE</div>
        <div>WAITING FOR ACTION</div>
        {error && <div className='error'>Status: {error}</div>}
        {redirectUrl && <button onClick={() => window.location.href = redirectUrl}>
            Continue to App
        </button>}
    </div>;
}

export default App;
