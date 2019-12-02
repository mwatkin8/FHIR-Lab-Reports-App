async function loadPatient(){
    //URL parameters received from the authorization server
    let state = getUrlParameter("state");  // session key
    let code = getUrlParameter("code"); // authorization code
    //Load the previously saved params
    let params = JSON.parse(sessionStorage[state]);
    let token = params.token;
    let client = params.client;
    let secret = params.secret;
    window.server = params.server;
    //Check for reportID if launched from hooks card
    if (params.hasOwnProperty('reportID')){
        window.reportID = params.reportID;
        document.getElementById('select-message').innerText = 'Loading report...';
    }
    else{
        window.reportID = 'none';
        document.getElementById('select-message').innerText = 'Select a report';
    }
    let redirect = params.redirect;
    // Exchange token
    let r = await fetch(token, {
        method:'POST',
        body: 'grant_type=authorization_code&client_id=' + client + '&redirect_uri=' + redirect + '&code=' + code,
        headers: {
		    'Content-Type': 'application/x-www-form-urlencoded'
	    }
    });
    let res = await r.json();
    window.access_token = res.access_token;
    window.patient_id = res.patient;
    main();
}

// Convenience function for parsing of URL parameters
// based on http://www.jquerybyexample.net/2012/06/get-url-parameters-using-jquery.html
function getUrlParameter(sParam) {
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

/**
 * Functions which query the server must be async in order to wait until the response is received.
 */
async function main(){
    document.getElementById('loading-list').style.visibility = 'visible';
    await demographics();
    await display_patient_tests();
    document.getElementById('loading-list').style.visibility = 'hidden';
    if(window.reportID !== 'none'){
        await initialize();
    }
}

async function initialize(){
    document.getElementById(window.reportID).classList.add('test-selected');
    document.getElementById('summary-option').classList.add('option-selected');
    document.getElementById('main-content').innerHTML = '<img style="padding-left:350px;" src="../img/loader.gif"/>';
    let url = window.server + '/DiagnosticReport?_id=' + window.reportID;
    let bundle = await getResource(url);
    let report = bundle.entry[0].resource;
    let test = report.code.coding[0].display;
    let practitioner_id = report.performer[0].reference;
    url = window.server + '/' + practitioner_id;
    let practitioner = await getResource(url);
    let practitioner_name = practitioner.name[0].given[0] + ' ' + practitioner.name[0].family;
    let practitioner_details = '(' + practitioner.identifier[0].value + ', ' + practitioner.identifier[0].system + ')';
    let conclusion = report.conclusion;
    let background_info = '';
    let genotype_id = report.result[2].reference;
    let genotype = await getResource(window.server + '/' + genotype_id);
    background_info += '<p><b>Test Result: </b>' + genotype.valueString + '</p>';
    let interpretation_id = report.result[1].reference;
    let interpretation = await getResource(window.server + '/' + interpretation_id);
    background_info += '<p><b>Interpretation: </b>' + interpretation.valueString + '</p>';
    let implication_id = report.result[0].reference;
    let implication = await getResource(window.server + '/' + implication_id);
    background_info += '<p><b>Implication: </b>' + implication.valueString + '</p>';
    background_info = await parseConclusion(background_info, conclusion);
    document.getElementById('main-content').innerHTML = '<div id="frame">' +
        '<div class="main-about">' +
        '<p><b>Test:</b> <span class="summary-header">' + test + '</span></p>' +
        '<p><b>Performed by:</b> <span class="summary-header">' + practitioner_name + '</span> ' + practitioner_details + '</p>' +
        '<button class="btn btn-primary" onclick="displayLabSite()">View test details on lab website</button></div>' +
        '<div class="summary-background">' + background_info + '</div>' +
        '</div>';
}

async function getResource(url){
    let request = new Request(url, {
        method: 'get',
        headers: {'Authorization': 'Bearer ' + window.access_token}
    });
    let response = await fetch(request);
    return await response.json();
}

async function demographics(){
    let url = window.server + '/Patient?_id=' + window.patient_id;
    let bundle = await getResource(url);
    let patient = bundle.entry[0].resource;
    document.getElementById('patient-name').innerText = patient.name[0].given[0] + ' ' + patient.name[0].family + ' ';
    let today = new Date();
    let age = today.getFullYear() - parseInt(patient.birthDate.split('-')[0]);
    document.getElementById('demographics').innerText += patient.gender + ', ' + age.toString() + ' years old';
}

async function display_patient_tests(){
    let tests = await get_list_of_tests();
    let reports = await get_diagnostic_reports();
    let html = '';
    for (let i = 0; i < reports.length; i++) {
        let r = reports[i];
        if (tests.includes(r.code.coding[0].code)) {
            let name = r.code.coding[0].display;
            let details = r.meta.lastUpdated.substring(0, 10) + ' |  FHIR ID: ' + r.id;
            if (r.id === window.reportID){
                html = '<li id="' + r.id + '" class="nav-item test-list-item report test-li" onclick="selectReport(this)"><div><p class="test-name no-bottom">' + name + '</p><p class="no-top no-bottom text-muted test-detail">' + details + '</p></div></li>' + html
            }
            else{
                html += '<li id="' + r.id + '" class="nav-item test-list-item report test-li" onclick="selectReport(this)"><div><p class="test-name no-bottom">' + name + '</p><p class="no-top no-bottom text-muted test-detail">' + details + '</p></div></li>'
            }
        }
    }
    document.getElementById('test-list').innerHTML = html;
}

function searchTests(e){
    let filter, txtValue;
    filter = e.value.toUpperCase();
    let reports = document.getElementsByClassName('report');
    for (let i = 0; i < reports.length; i++){
        let d = reports[i];
        txtValue = d.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
            d.style.display = "";
        } else {
            d.style.display = "none";
        }
    }
}

async function get_diagnostic_reports(){
    let url = window.server + '/DiagnosticReport?subject=' + window.patient_id + '&_count=200';
    let next = true;
    let reports = [];
    //Fetch all possible pages of results
    while(next === true){
        let bundle = await getResource(url);
        for(let i = 0; i < bundle.link.length; i++){
            if (bundle.link[i].relation === 'self'){
                next = false;
            }
            if (bundle.link[i].relation === 'next'){
                next = true;
                url = bundle.link[i].url;
            }
        }
        for (let i = 0; i < bundle.entry.length; i++){
            reports.push(bundle.entry[i].resource);
        }
    }
    return reports
}

async function get_list_of_tests(){
    let url = window.server + '/ValueSet?name=arup-genetic-tests';
    let bundle = await getResource(url);
    let r = bundle.entry[0].resource;
    let array = r.compose.include;
    let tests = [];
    for(let i = 0; i < array.length; i++){
        tests.push(array[i].concept[0].code);
    }
    return tests
}

async function selectReport(e){
    try {
        let message = document.getElementById('select-message');
        message.parentNode.removeChild(message);
        let frame = document.getElementById('frame');
        frame.parentNode.removeChild(frame);
    }
    catch{}
    let list = document.getElementsByClassName('option-selected');
    for(let i = 0; i < list.length; i++){
        list[i].classList.remove('option-selected');
    }
    list = document.getElementsByClassName('test-selected');
    for (let i = 0; i < list.length; i++) {
        list[i].classList.remove('test-selected');
    }
    e.classList.add('test-selected');
    let li = e.getElementsByClassName('test-detail')[0];
    window.reportID = li.innerText.split('FHIR ID: ')[1];
    document.getElementById('summary-option').classList.add('option-selected');
    displaySummary();

}

async function displaySummary(){
    try {
        let frame = document.getElementById('frame');
        frame.parentNode.removeChild(frame);
        let list = document.getElementsByClassName('option-selected');
        for(let i = 0; i < list.length; i++){
            list[i].classList.remove('option-selected');
        }
        document.getElementById('summary-option').classList.add('option-selected');
    }
    catch{}
    document.getElementById('main-content').innerHTML = '<img style="padding-left:350px;" src="../img/loader.gif"/>';
    let report = await getResource(window.server + '/DiagnosticReport/' + window.reportID);
    //let report =  bundle.entry[0].resource;
    let test = report.code.coding[0].display;
    let practitioner_id = report.performer[0].reference;
    let practitioner = await getResource(window.server + '/' + practitioner_id);
    let practitioner_name = practitioner.name[0].given[0] + ' ' + practitioner.name[0].family;
    let practitioner_details = '(' + practitioner.identifier[0].value + ', ' + practitioner.identifier[0].system + ')';
    let conclusion = report.conclusion;
    let background_info = '';
    let genotype_id = report.result[2].reference;
    let genotype = await getResource(window.server + '/' + genotype_id);
    background_info += '<p><b>Test Result: </b>' + genotype.valueString + '</p>';
    let interpretation_id = report.result[1].reference;
    let interpretation = await getResource(window.server + '/' + interpretation_id);
    background_info += '<p><b>Interpretation: </b>' + interpretation.valueString + '</p>';
    let implication_id = report.result[0].reference;
    let implication = await getResource(window.server + '/' + implication_id);
    background_info += '<p><b>Implication: </b>' + implication.valueString + '</p>';
    background_info = await parseConclusion(background_info, conclusion);
    document.getElementById('main-content').innerHTML = '<div id="frame">' +
        '<div class="main-about">' +
        '<p><b>Test:</b> <span class="summary-header">' + test + '</span></p>' +
        '<p><b>Performed by:</b> <span class="summary-header">' + practitioner_name + '</span> ' + practitioner_details + '</p>' +
        '<button class="btn btn-primary" onclick="displayLabSite()">View test details on lab website</button></div>' +
        '<div class="summary-background">' + background_info + '</div>' +
        '</div>';
}

function parseConclusion(background_info, conclusion){
    let l = conclusion.split('\n\n');
    for (let i = 1; i < l.length; i++) {
        let line = l[i];
        let type = line.split(':')[0];
        let content = line.split(':')[1];
        switch(type) {
            case 'CHARACTERISTICS':
                content = content.replace('Simvastatin','<a href="https://medlineplus.gov/druginfo/meds/a692030.html">Simvastatin</a>');
                content = content.replace('organic anion transporter polypeptide 1B1','<a href="https://www.ncbi.nlm.nih.gov/pubmed/?term=OATP+(1B1)">organic anion transporter polypeptide 1B1</a>')
                content = content.replace('dose-dependent myopathy','<a href="https://www.uptodate.com/contents/statin-muscle-related-adverse-events">dose-dependent myopathy</a>')
                background_info += '<p><b>' + type + ':</b>' + content + '</p>';
                break;
            case 'INHERITANCE':
                content = content.replace('Autosomal co-dominant','<a href="https://ghr.nlm.nih.gov/primer/inheritance/inheritancepatterns">Autosomal co-dominant</a>');
                background_info += '<p><b>' + type + ': </b>' + content + '</p>';
                break;
            case 'CAUSE':
                background_info += '<p><b>' + type + ': </b>' + content + '</p>';
                break;
            case 'ALLELE TESTED':
                content = content.replace('SLCO1B1*5 (rs4149056, c.521T>C)','<a href="https://www.pharmgkb.org/haplotype/PA165819255/clinicalAnnotation/655384011">SLCO1B1*5 (rs4149056, c.521T>C)</a>');
                background_info += '<p><b>' + type + ': </b>' + content + '</p>';
                break;
            case 'ALLELE FREQUENCY':
                background_info += '<p><b>' + type + ': </b>' + content + '</p>';
                break;
            case 'CLINICAL SENSITIVITY':

                break;
            case 'METHODOLOGY':
                content = content.replace('Polymerase Chain Reaction (PCR) and Fluorescence Monitoring','<a href="https://www.uptodate.com/contents/tools-for-genetics-and-genomics-polymerase-chain-reaction#H986053159">Polymerase Chain Reaction (PCR) and Fluorescence Monitoring</a>');
                background_info += '<p><b>' + type + ': </b>' + content + '</p>';
                break;
            case 'ANALYTICAL SENSITIVITY AND SPECIFICITY':
                background_info += '<p><b>' + type + ': </b>' + content + '</p>';
                break;
            case 'LIMITATIONS':
                background_info += '<p><b>' + type + ': </b>' + content;
                break;
            default:
                line = line.replace('aruplab.com/CS','<a href="https://www.aruplab.com/testing/compliance">aruplab.com/CS</a>');
                background_info += line + '</p>';
                break;
        }
    }
    return background_info
}

async function displayLabSite(){
    let url = window.server + '/DiagnosticReport?_id=' + window.reportID;
    let bundle = await getResource(url);
    let report =  bundle.entry[0].resource;
    let code = report.code.coding[0].code;
    let lab_url = 'http://ltd.aruplab.com/tests/pub/' + code + '?';
    window.open(lab_url);
}

async function displayPDF(){
    try {
        let frame = document.getElementById('frame');
        frame.parentNode.removeChild(frame);
        let list = document.getElementsByClassName('option-selected');
        for(let i = 0; i < list.length; i++){
            list[i].classList.remove('option-selected');
        }
        document.getElementById('pdf-option').classList.add('option-selected')
    }
    catch{}
    document.getElementById('main-content').innerHTML = '<img style="padding-left:350px;" src="../img/loader.gif"/>';
    let url = window.server + '/DiagnosticReport?_id=' + window.reportID;
    let bundle = await getResource(url);
    let r =  bundle.entry[0].resource;
    let base64 = r.presentedForm[0].data;
    let byteCharacters = atob(base64);
    let byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    let byteArray = new Uint8Array(byteNumbers);
    let blob = new Blob([byteArray], {type: "application/pdf"});
    let file = window.URL.createObjectURL(blob);
    document.getElementById('main-content').innerHTML = '<iframe id="frame" width="100%" height="800px" src="' + file + '"></iframe>'
}

async function displayHooks(){
    try {
        let frame = document.getElementById('frame');
        frame.parentNode.removeChild(frame);
        let list = document.getElementsByClassName('option-selected');
        for(let i = 0; i < list.length; i++){
            list[i].classList.remove('option-selected');
        }
        document.getElementById('hook-option').classList.add('option-selected')
    }
    catch{}
    document.getElementById('main-content').innerHTML = '<img style="padding-left:350px;" src="../img/loader.gif"/>';
    //Get the service PlanDefinition resource
    let url = window.server + '/PlanDefinition?url=fhir_lab_reports_service';
    let bundle = await getResource(url);
    let service =  bundle.entry[0].resource;
    delete service.text;

    //Get the response card RequestGroup resource
    url = window.server + '/RequestGroup?subject=' + window.patient_id + '&code=fhir_lab_reports_response';
    bundle = await getResource(url);
    let card =  bundle.entry[0].resource;
    delete card.text;
    document.getElementById('main-content').innerHTML = '<div id="frame">' +
        '<div class="main-about"><h5>About CDS Hooks</h5><p><a href="https://cds-hooks.org/">CDS Hooks</a> is used to "hook" clinical decision support (CDS) services if certain criteria are met. ' +
        'In the boxes below are the FHIR resources representing both the CDS service created in response to this report and the response card which will be returned by the service.</p>' +
        '<ul>' +
        '<li><a href="http://hl7.org/fhir/clinicalreasoning-cds-on-fhir.html#representing-services">CDS Hooks Service</a> - hooked under two conditions:' +
        '<ol><li>A pre-defined hook type is activated such as the "patient-view" hook (when the patient chart is opened) or the "order-select" hook (when an order, such as a test or medication, is placed).</li>' +
        '<li>Specified "pre-fetched" resources meet certain criteria.</li>' +
        '</ol></li>' +
        '<li><a href="http://hl7.org/fhir/clinicalreasoning-cds-on-fhir.html#evaluation">Response Card</a> - representation of the results of the CDS service to be displayed to the user within the EHR. Can include suggestions or links to additional resources (such as a SMART on FHIR app) </li>' +
        '</ul>' +
        '</div><br>' +
        '<h5>CDS Hooks Service</h5>' +
        '<pre class="hook-box"><code id="view">' + JSON.stringify(service, null, 2) + '</code></pre>' +
        '<h5>Response Card</h5>' +
        '<pre class="hook-box"><code id="view">' + JSON.stringify(card, null, 2) + '</code></pre>' +
        '</div>';
}

async function displayFHIR(){
    try {
        let frame = document.getElementById('frame');
        frame.parentNode.removeChild(frame);
        let list = document.getElementsByClassName('option-selected');
        list[0].classList.remove('option-selected');
        document.getElementById('fhir-option').classList.add('option-selected')
    }
    catch{}
    document.getElementById('main-content').innerHTML = ' <div id="frame">' +
        '<div class="main-about"><h5>About FHIR</h5><p>HL7\'s <a href="https://www.hl7.org/fhir/overview.html">FHIR</a> (Fast Healthcare Interoperable Resources) standard is a widely-adopted data standard which abstracts clinical ' +
        'scenarios into separate resources. These resources are linked together to describe a given scenario.</p><p>The following are all the resources in the patient\'s history which are associated with this lab report.</p></div><br>' +
        '<div class="row fhir-box">' +
        '    <div class="col-md-5 order-md-2 mb-4">' +
        '      <ul>' +
        '        <li class="top fhir-li" onclick="viewResource(this,\'pat\')"><p class="fhir-p" >Patient</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'pract-clinic\')"><p class="fhir-p" >Practitioner (clinic)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'loc-clinic\')"><p class="fhir-p" >Location (clinic)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'enc-clinic\')"><p class="fhir-p" >Encounter (clinic)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'sr-blood\')"><p class="fhir-p" >ServiceRequest (blood draw)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'sr-test\')"><p class="fhir-p" >ServiceRequest (test)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'pract-blood\')"><p class="fhir-p" >Practitioner (blood draw)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'enc-blood\')"><p class="fhir-p" >Encounter (blood draw)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'proc-blood\')"><p class="fhir-p" >Procedure (blood draw)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'specimen\')"><p class="fhir-p" >Specimen (blood sample)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'loc-lab\')"><p class="fhir-p" >Location (lab)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'pract-lab\')"><p class="fhir-p" >Practitioner (lab)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'proc-test\')"><p class="fhir-p" >Procedure (test)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'obs-imp\')"><p class="fhir-p" >Observation (result - implication)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'obs-int\')"><p class="fhir-p" >Observation (result - interpretation)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'obs-gen\')"><p class="fhir-p" >Observation (result - genotype)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'obs-var\')"><p class="fhir-p" >Observation (result - variant)</p></li>' +
        '        <li class="fhir-li" onclick="viewResource(this,\'dr\')"><p class="fhir-p" >DiagnosticReport</p></li>' +
        '      </ul>' +
        '    </div>' +
        '    <div class="col-md-7 order-md-2 mb-4">' +
        '      <pre class="view-box"><code id="view"></code></pre>' +
        '    </div>' +
        '  </div>' +
        '</div>';
    document.getElementById('view').innerHTML = '<img class="center" src="../img/loader.gif"/>';
    await gatherIDs();
    document.getElementById('view').innerHTML = '';
    document.getElementById('view').innerText = 'Select a resource to view.';
}

async function gatherIDs(){
    let r = await getResource(window.server + '/DiagnosticReport/' + window.reportID);
    window.lab_practitioner = r.performer[0].reference.split('/')[1];
    window.specimen = r.specimen[0].reference.split('/')[1];
    window.res_implication = r.result[0].reference.split('/')[1];
    window.res_interpretation = r.result[1].reference.split('/')[1];
    window.res_genotype = r.result[2].reference.split('/')[1];
    window.res_variant = r.result[3].reference.split('/')[1];
    window.test_request = r.basedOn[0].reference.split('/')[1];
    window.clinic_encounter = r.encounter.reference.split('/')[1];
    r = await getResource(window.server + '/Encounter/' + window.clinic_encounter);
    window.clinic_location = r.location[0].location.reference.split('/')[1];
    window.clinic_practitioner = r.participant[0].individual.reference.split('/')[1];
    r = await getResource(window.server + '/ServiceRequest/' + window.test_request);
    window.lab_location = r.locationReference[0].reference.split('/')[1];
    let bundle = await getResource(window.server + '/ServiceRequest?encounter=' + window.clinic_encounter);
    for (let i = 0; i < bundle.total; i++){
        r = bundle.entry[i].resource;
        //Find the blood draw order
        if (r.code.coding[0].code === '82078001'){
            window.blood_request = r.id;
            window.blood_practitioner = r.performer[0].reference.split('/')[1];
        }
    }
    bundle = await getResource(window.server + '/Encounter?based-on=' + window.blood_request);
    r = bundle.entry[0].resource;
    window.blood_encounter = r.id;
    window.blood_procedure = r.diagnosis[0].condition.reference.split('/')[1];
    bundle = await getResource(window.server + '/Procedure?based-on=' + window.test_request);
    r = bundle.entry[0].resource;
    window.test_procedure = r.id;
}

async function viewResource(li, type) {
    let list = document.getElementsByClassName('selected');
    for (let i = 0; i < list.length; i++) {
        list[i].classList.remove('selected')
    }
    li.className += ' selected';
    let url, r;
    switch (type) {
        case 'pat':
            url = window.server + '/Patient/' + window.patient_id;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'pract-clinic':
            url = window.server + '/Practitioner/' + window.clinic_practitioner;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'loc-clinic':
            url = window.server + '/Location/' + window.clinic_location;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'enc-clinic':
            url = window.server + '/Encounter/' + window.clinic_encounter;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'sr-blood':
            url = window.server + '/ServiceRequest/' + window.blood_request;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'sr-test':
            url = window.server + '/ServiceRequest/' + window.test_request;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'pract-blood':
            url = window.server + '/Practitioner/' + window.blood_practitioner;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'enc-blood':
            url = window.server + '/Encounter/' + window.blood_encounter;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'proc-blood':
            url = window.server + '/Procedure/' + window.blood_procedure;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'specimen':
            url = window.server + '/Specimen/' + window.specimen;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'loc-lab':
            url = window.server + '/Location/' + window.lab_location;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'pract-lab':
            url = window.server + '/Practitioner/' + window.lab_practitioner;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'proc-test':
            url = window.server + '/Procedure/' + window.test_procedure;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-imp':
            url = window.server + '/Observation/' + window.res_implication;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-int':
            url = window.server + '/Observation/' + window.res_interpretation;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-gen':
            url = window.server + '/Observation/' + window.res_genotype;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-var':
            url = window.server + '/Observation/' + window.res_variant;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'dr':
            url = window.server + '/DiagnosticReport/' + window.reportID;
            r = await getResource(url);
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        default:
            document.getElementById('view').innerText = 'Invalid selection';

    }
}
