async function launch(){
    //Would use in live implementation, null for testing implementation
    let secret = null;
    //URL for the secure data endpoint
    let server = getUrlParameter("iss");
    //Launch context parameter
    let launch = getUrlParameter("launch");
    //ID of the DiagnosticReport for selected test (if launched from hook card)
    let reportID = getUrlParameter("reportID");
    //Given by sandbox when registering
    let client = "b31221cf-fef3-4266-a52c-30658f950599";
    //Permission to launch and read all reasources for the launch patient
    let scope = ["patient/*.read","launch"].join(" ");
    //Random session key
    let state = Math.round(Math.random()*100000000).toString();
    //Set redirect to the app landing page
    let url = window.location.protocol + "//" + window.location.host + window.location.pathname;
    let redirect = url.replace("smart-launch","");
    // Get the conformance statement and extract URL for auth server and token
    let req = await fetch(server + "/metadata");
    let r = await req.json();
    let auth,token;
    let smartExtension = r.rest[0].security.extension.filter(function (e) {
        return (e.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris");
    });
    smartExtension[0].extension.forEach(function(arg, index, array){
        if (arg.url === "authorize") {
            auth = arg.valueUri;
        } else if (arg.url === "token") {
            token = arg.valueUri;
        }
    });
    //Save parameters
    sessionStorage[state] = JSON.stringify({
        secret: secret,
        server: server,
        launch: launch,
        reportID: reportID,
        client: client,
        redirect: redirect,
        auth: auth,
        token: token
    });
    //Redirect to the authorization server and request launch
    window.location.href = auth + "?" +
        "response_type=code&" +
        "client_id=" + encodeURIComponent(client) + "&" +
        "scope=" + encodeURIComponent(scope) + "&" +
        "redirect_uri=" + encodeURIComponent(redirect) + "&" +
        "aud=" + encodeURIComponent(server) + "&" +
        "launch=" + launch + "&" +
        "state=" + state
}

// Convenience function for parsing of URL parameters
// based on http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
function getUrlParameter(sParam)
{
    let sPageURL = window.location.search.substring(1);
    let sURLVariables = sPageURL.split('&');
    for (let i = 0; i < sURLVariables.length; i++)
    {
        let sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam) {
            let res = sParameterName[1].replace(/\+/g, '%20');
            return decodeURIComponent(res);
        }
    }
}
