
async function transform(){
    //set loading gif
    document.getElementById('main').classList += ' main-loading';
    document.getElementById('loading').style.visibility = 'visible';

    let  server = document.getElementById('server').value + '/';

    //Patient sits down with doctor at the clinic
    console.log(await handleValueSet(server));
    let patient = await handlePatient(server);
    let clinic_practitioner = await handlePractitioner('clinic', server);
    let clinic_location = await handleLocation('clinic', server);
    let clinic_encounter = await createEncounter('clinic', patient, clinic_practitioner, clinic_location, '', server);

    //The test and necessary blood draw are ordered
    let lab_location = await handleLocation('lab', server);
    let test_request = await createServiceRequest('lab', patient, clinic_practitioner, lab_location, clinic_encounter, server);
    let blood_request = await createServiceRequest('blood', patient, clinic_practitioner, clinic_location, clinic_encounter, server);

    //The appointment with the doctor ends after 15 minutes
    await endEncounter(clinic_encounter, server);

    //The patient goes to the phlebotomist (same clinic location) for the blood draw
    let blood_practitioner = await handlePractitioner('blood', server);
    let blood_encounter = await createEncounter('blood', patient, blood_practitioner, clinic_location, blood_request, server);
    let blood_procedure = await createBloodProcedure(patient, blood_practitioner, blood_request, blood_encounter, clinic_location, server);
    await updateEncounter(blood_encounter, blood_procedure, server);
    let blood_specimen = await createSpecimen(patient, clinic_practitioner, server);

    //After the procedure, the specimen is ready for the lab
    await updateServiceRequest(blood_request, blood_practitioner, server);
    await addSpecimen(test_request, blood_specimen, server);
    await endProcedure(blood_procedure, server);
    await endEncounter(blood_encounter, server);

    //The specimen is sent to the lab and the test is performed
    let lab_practitioner = await handlePractitioner('lab', server);
    let test_procedure = await createTestProcedure(patient, lab_practitioner, test_request, lab_location, server);

    //The task is completed and a report is made
    let res_implication = await createObsImplication(patient, server);
    let res_interpretation = await createObsOverall(patient, server);
    let res_genotype = await createObsGenotype(patient, server);
    let res_variant = await createObsVariant(patient, server);
    let diag_report = await createDiagnosticReport(patient, lab_practitioner, test_request, clinic_encounter, blood_specimen, res_implication, res_interpretation, res_genotype, res_variant, server);
    await updateServiceRequest(test_request, lab_practitioner, server);
    await addReport(test_procedure, diag_report, server);
    await endProcedure(test_procedure, server);

    //Verify that a CDS Hooks service exists for this test response and create a response card
    let hook_service = await handleHookService(server);
    let hook_response = await createHookResponse(patient, diag_report, res_implication, server);

    //Save the IDs as globals to be accessed by the results page
    localStorage['fhir_server'] = server;
    localStorage['fhirID_patient'] = patient;
    localStorage['fhirID_clinic_practitioner'] = clinic_practitioner;
    localStorage['fhirID_clinic_location'] = clinic_location;
    localStorage['fhirID_clinic_encounter'] = clinic_encounter;
    localStorage['fhirID_lab_location'] = lab_location;
    localStorage['fhirID_blood_request'] = blood_request;
    localStorage['fhirID_test_request'] = test_request;
    localStorage['fhirID_blood_practitioner'] = blood_practitioner;
    localStorage['fhirID_blood_encounter'] = blood_encounter;
    localStorage['fhirID_blood_procedure'] = blood_procedure;
    localStorage['fhirID_blood_specimen'] = blood_specimen;
    localStorage['fhirID_lab_practitioner'] = lab_practitioner;
    localStorage['fhirID_test_procedure'] = test_procedure;
    localStorage['fhirID_res_implication'] = res_implication;
    localStorage['fhirID_res_interpretation'] = res_interpretation;
    localStorage['fhirID_res_genotype'] = res_genotype;
    localStorage['fhirID_res_variant'] = res_variant;
    localStorage['fhirID_diag_report'] = diag_report;
    localStorage['fhirID_hook_service'] = hook_service;
    localStorage['fhirID_hook_response'] = hook_response;

    //Launch results page
    window.location.href = '../templates/lab-result.html';
}

async function fetchTemplate(type){
    let response = await fetch('../resource-json/' + type + '.json');
    return await response.json();
}

async function postResource(entry, server){
    let bundle = await JSON.parse('{\"resourceType\": \"Bundle\",\"type\": \"transaction\",\"total\": 1, \"entry\": []}')
    bundle.entry.push(entry);
    let params = {
        method:"POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bundle)
    };
    let response = await fetch(server, params);
    let r = await response.json();
    if (r.entry[0].response.status === '201 Created'){
        return r.entry[0].response.location.split('/')[1]
    }
    else{
        return 'error'
    }
}

async function updateResource(type, id, resource, server){
    let params = {
        method:"PUT",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(resource)
    };
    let response = await fetch(server + type + '/' + id, params);
    let r = await response.json();
    return r
}

async function handleValueSet(server){
    let response = await fetch(server + 'ValueSet?name=arup-genetic-tests');
    let bundle = await response.json();
    if (bundle.total === 0){
        let t = await fetchTemplate('arup_genetic_test_valueset');
        let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Procedure\"}}');
        entry.resource = t;
        return postResource(entry,server);
    }
}

async function handlePatient(server){
    //Check for existing patient resource in server
    let first_name = document.getElementById('patient').value.split(', ')[1];
    let last_name = document.getElementById('patient').value.split(', ')[0];
    let dob = document.getElementById('dob').value.split('/');
    let birthDate = dob[2] + '-' + dob[0] + '-' + dob[1];
    let response = await fetch(server + 'Patient?name=' + last_name);
    //Check each patient with that last name for a first name and birthday match
    let bundle = await response.json();
    if (bundle.total !== 0){
        for(let i = 0; i < bundle.entry.length; i++){
            let r = bundle.entry[i].resource;
            if (r.name[0].given[0] === first_name){
                if (r.birthDate === birthDate){
                    return r.id;
                }
            }
        }
    }
    //If none match, create new resource
    let t = await fetchTemplate('Patient');
    t.name[0].given[0] = first_name;
    t.name[0].family = last_name;
    t.gender = document.getElementById('gender').value.toLowerCase();
    t.birthDate = birthDate;
    let identifiers = document.getElementById('patient-identifiers').value.split(', ');
    t.identifier[0].value = identifiers[0];
    let c = document.getElementById('client').value.split(' ');
    t.identifier[0].system = 'http://' + c[0].toLowerCase() + '-' + c[1].toLowerCase() + '-' + c[2].toLowerCase() + '/patient-ids';
    t.identifier[1].value = identifiers[1];
    t.identifier[1].system = 'http://aruplab.com/patient-ids';
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Patient\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function handlePractitioner(type, server){
    //Check for existing practitioner resource in server with matching name
    let first_name,last_name;
    if (type === 'lab'){
        let re = new RegExp('reviewed and approved by .+');
        let array = re.exec(document.getElementById('info1').value);
        let n = array[0].split(' by ')[1].split(' ');
        first_name = n[0];
        last_name = n[1].slice(0,-1);
    }
    else if(type === 'blood'){
        first_name = 'Example';
        last_name = 'Blood';
    }
    else{
        first_name = document.getElementById('physician').value.split(', ')[1];
        last_name = document.getElementById('physician').value.split(', ')[0];
    }
    let response = await fetch(server + 'Practitioner?name=' + last_name);
    //Check each practitioner with that last name for a first name match
    let bundle = await response.json();
    if (bundle.total !== 0){
        for(let i = 0; i < bundle.entry.length; i++){
            let r = bundle.entry[i].resource;
            if (r.name[0].given[0] === first_name){
                return r.id;
            }
        }
    }
    //If none match, create new resource
    let t = await fetchTemplate('Practitioner');
    t.name[0].given[0] = first_name;
    t.name[0].family = last_name;
    if (type === 'lab'){
        t.identifier[0].value = 'fake-arup-id';
        t.identifier[0].system = 'http://aruplab.com/directory';
    }
    else if (type === 'blood'){
        let c = document.getElementById('client').value.split(' ');
        let client = c[0].toLowerCase() + '-' + c[1].toLowerCase() + '-' + c[2].toLowerCase();
        t.identifier[0].value = 'fake-' + client + '-phlebotomy-id';
        t.identifier[0].system = 'http://' + client + '/phlebotomy-directory';
    }
    else{
        let c = document.getElementById('client').value.split(' ');
        let client = c[0].toLowerCase() + '-' + c[1].toLowerCase() + '-' + c[2].toLowerCase();
        t.identifier[0].value = 'fake-' + client + '-id';
        t.identifier[0].system = 'http://' + client + '/directory';
    }
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Practitioner\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function handleLocation(type, server){
    let name;
    if (type === 'lab'){
        name = 'ARUP_Laboratories';
    }
    else{
        let c = document.getElementById('client').value.split(' ');
        name = c[0] + '_' + c[1] + '_' + c[2];
    }
    let response = await fetch(server + 'Location?name=' + name);
    //Check for a location resource with that name
    let bundle = await response.json();
    if (bundle.total !== 0){
        return bundle.entry[0].resource.id;
    }
    //If none match, create new resource
    let t = await fetchTemplate('Location');
    if (type === 'lab'){
        t.name = 'ARUP Laboratories';
        t.address.line[0] = '500 Chipeta Way';
        t.address.city = 'Salt Lake City';
        t.address.state = 'UT';
        t.address.postalCode = '84108-1221';
    }
    else{
        t.name = document.getElementById('client').value;
        let a = document.getElementById('address').value.split('\n');
        t.address.line[0] = a[0];
        t.address.city = a[1].split(', ')[0];
        t.address.state = a[1].split(', ')[1].split(' ')[0];
        t.address.postalCode = a[1].split(', ')[1].split(' ')[1];
    }
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Location\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function createEncounter(type, patient, practitioner, location, request, server){
    let t = await fetchTemplate('Encounter');
    t.subject.reference += patient;
    t.status = 'in-progress';
    t.class.system = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
    t.class.code = 'AMB'; //ambulatory (outpatient)
    if (type === 'clinic') {
        let c = document.getElementById('client').value.split(' ');
        let client = c[0].toLowerCase() + '-' + c[1].toLowerCase() + '-' + c[2].toLowerCase();
        t.identifier = [];
        t.identifier.push({
            'value': document.getElementById('visit-number').value,
            'system': 'http://' + client + '/FIN'
        });
    }
    else{
        t.basedOn = [{
            'reference': 'ServiceRequest/' + request
        }];
    }
    t.location.push({
        'location': {
            'reference': 'Location/' + location
        }
    });
    t.participant.push({
        'individual': {
            'reference': 'Practitioner/' + practitioner
        },
        'type': [
            {
                'coding': [
                    {
                        'code': 'PPRF',
                        'system': 'http://hl7.org/fhir/v3/ParticipationType',
                        'display': 'primary performer'
                    }
                ]
            }
        ]
    });
    t.classHistory.push({
        'class': {
            'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            'code': 'AMB'
        },
        'period': {
            'start': new Date(Date.now()).toISOString(),
            'end': ''
        }
    });
    t.statusHistory.push({
        'status': 'in-progress',
        'period': {
            'start': new Date(Date.now()).toISOString(),
            'end': ''
        }
    });
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Encounter\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function updateEncounter(encounter, procedure, server){
    let response = await fetch(server + 'Encounter/' + encounter);
    let r = await response.json();
    r.diagnosis = [];
    r.diagnosis[0] = {
        'condition': {
            'reference': 'Procedure/' + procedure
        }
    };
    return updateResource('Encounter',encounter,r,server);
}

async function endEncounter(encounter, server){
    let response = await fetch(server + 'Encounter/' + encounter);
    let r = await response.json();
    r.status = 'finished';
    let endtime = new Date(Date.now());
    endtime.setMinutes(endtime.getMinutes() + 15);
    r.classHistory[0].period.end = endtime.toISOString();
    r.statusHistory[0].period.end = endtime.toISOString();
    return updateResource('Encounter',encounter,r,server);
}

async function createServiceRequest(type, patient, practitioner, location, encounter, server){
    let t = await fetchTemplate('ServiceRequest');
    t.status = 'active';
    t.intent = 'original-order';
    if (type === 'blood'){
        t.code.coding[0].system = 'http://snomed.info/sct';
        t.code.coding[0].code = '82078001';
        t.code.text = 'Collection of blood specimen for laboratory';
    }
    else{
        t.code.coding[0].system = 'https://www.aruplab.com/testing';
        t.code.coding[0].code = '2008426';
        t.code.text = 'SLCO1B1, 1 Variant';
    }
    t.locationReference[0].reference += location;
    t.subject.reference += patient;
    t.occurrenceDateTime = new Date(Date.now()).toISOString();
    t.requester.reference += practitioner;
    t.encounter.reference += encounter;
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"ServiceRequest\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function updateServiceRequest(request, practitioner, server){
    let response = await fetch(server + 'ServiceRequest/' + request);
    let r = await response.json();
    r.performer = [];
    r.performer[0] = {
        'reference': 'Practitioner/' + practitioner
    };
    r.status = 'completed';
    return updateResource('ServiceRequest',request,r,server);
}

async function createBloodProcedure(patient, practitioner, request, encounter, location, server){
    let t = await fetchTemplate('Procedure');
    t.subject += patient;
    t.status = 'in-progress';
    t.code.coding[0].code = '82078001';
    t.code.coding[0].system = 'http://snomed.info/sct';
    t.code.coding[0].display = 'Collection of blood specimen for laboratory';
    t.performer[0].actor.reference += practitioner;
    t.basedOn = [{
        'reference': 'ServiceRequest/' + request
    }];
    t.encounter = {
        'reference': 'Encounter/' + encounter
    };
    t.location.reference += location;
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Procedure\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function createTestProcedure(patient, practitioner, request, location, server){
    let t = await fetchTemplate('Procedure');
    t.subject.reference += patient;
    t.status = 'in-progress';
    t.code.coding[0].code = document.getElementById('test-code').value;
    t.code.coding[0].system = 'https://www.aruplab.com/testing';
    t.code.coding[0].display = document.getElementById('test-name').value;
    t.performer[0].actor.reference += practitioner;
    t.basedOn = [{
        'reference': 'ServiceRequest/' + request
    }];
    t.location.reference += location;
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Procedure\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function endProcedure(procedure, server){
    let response = await fetch(server + 'Procedure/' + procedure);
    let r = await response.json();
    r.status = 'completed';
    return updateResource('Procedure',procedure,r,server);
}

async function createSpecimen(patient,practitioner,server){
    let t = await fetchTemplate('Specimen');
    t.subject.reference += patient;
    t.collection.collector.reference += practitioner;
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Specimen\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function addSpecimen(request, specimen, server){
    let response = await fetch(server + 'ServiceRequest/' + request);
    let r = await response.json();
    r.specimen = {
        'reference': 'Specimen/' + specimen
    };
    return updateResource('ServiceRequest',request,r,server);
}

async function createObsImplication(patient, server){
    let t = await fetchTemplate('Obs-implication');
    t.subject.reference += patient;
    let re = new RegExp('This patient .+');
    let array = re.exec(document.getElementById('info1').value);
    t.valueString = array[0];
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Observation\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function createObsOverall(patient, server){
    let t = await fetchTemplate('Obs-overall');
    t.subject.reference += patient;
    let re = new RegExp('Interpretation:.+ This patient');
    let array = re.exec(document.getElementById('info1').value);
    t.valueString = array[0].split('Interpretation: ')[1].split(' This patient')[0];
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Observation\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function createObsGenotype(patient, server){
    let t = await fetchTemplate('Obs-genotype');
    t.subject.reference += patient;
    t.code.coding.push({
        'system': 'http://loinc.org',
        'code': '79722-5',
        'display': 'SLCO1B1 gene product functional interpretation'
    });
    let re = new RegExp('\\w+,');
    let array = re.exec(document.getElementById('specimen-title').value);
    let name = array[0].split(',')[0];
    let code = await getGeneCode(name);
    t.component[0].valueCodeableConcept = {
        'coding': [
            {
                'system': 'http://hl7.org/fhir/ValueSet/genenames',
                'code': 'HGNC:' + code,
                'display': name
            }
        ]
    };
    t.valueString = document.getElementById('genotype-result').value;
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Observation\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function getGeneCode(name){
    //Hard-coded value for now. Can pull raw HTML or query for the FHIR valueset
    return '10959'
}

async function createObsVariant(patient, server){
    let t = await fetchTemplate('Obs-variant');
    t.subject.reference += patient;
    let re = new RegExp('METHODOLOGY:.+');
    let array = re.exec(document.getElementById('info2').value);
    let method_array = await getMethod(array[0].split(':')[1]);
    t.method.coding[0].code = method_array[0];
    t.method.coding[0].display = method_array[1];
    re = new RegExp('ALLELE TESTED:.+');
    array = re.exec(document.getElementById('info2').value);
    let hgvs = array[0].split('(')[1].split(', ')[1].split(')')[0];
    t.component[0].valueCodeableConcept.coding[0].code = hgvs;
    t.component[0].valueCodeableConcept.coding[0].display = hgvs;
    let type_array = await getVariantType(hgvs);
    t.component[0].code.coding[0].code = type_array[0];
    t.component[0].code.coding[0].display = type_array[1];
    let rs = array[0].split('(')[1].split(', ')[0];
    t.component[1].valueString = rs;
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"Observation\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function getMethod(methodology){
    //Hard-coded value for now.
    return ['LA26419-4','Structural variant analysis method (LL4048-6) - qPCR (real-time PCR)']
}

async function getVariantType(hgvs){
    //Hard-coded value for now.
    return ['48004-6','DNA change (c.HGVS)']
}

async function createDiagnosticReport(patient, practitioner, request, encounter, specimen, implication, interpretation, genotype, variant, server){
    let t = await fetchTemplate('DiagnosticReport');
    t.subject.reference += patient;
    t.status = 'final';
    t.basedOn[0].reference += request;
    t.encounter.reference += encounter;
    t.code.coding[0].code = document.getElementById('test-code').value;
    t.code.coding[0].system = 'https://www.aruplab.com/testing';
    t.code.coding[0].display = document.getElementById('test-name').value;
    let re = new RegExp('Accession:.+');
    let array = re.exec(document.getElementById('report-info1').value);
    let accession = array[0].split(': ')[1];
    t.identifier.push(
        {
            'value': accession,
            'system': 'https://www.aruplab.com/accessions'
        }
    );
    t.performer[0].reference += practitioner;
    t.specimen[0].reference += specimen;
    t.conclusion = document.getElementById('info2').value;
    t.result.push(
        {
            "reference": "Observation/" + implication
        },
        {
            "reference": "Observation/" + interpretation
        },
        {
            "reference": "Observation/" + genotype
        },
        {
            "reference": "Observation/" + variant
        }
    );
    let binary = localStorage['pdf-binary'];
    t.presentedForm = {
        'contentType': 'application/pdf',
        'language': 'en',
        'data': binary,
    };
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"DiagnosticReport\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function addReport(procedure, report, server){
    let response = await fetch(server + 'Procedure/' + procedure);
    let r = await response.json();
    r.report = {
        'reference': 'DiagnosticReport/' + report
    };
    return updateResource('Procedure',procedure,r,server);
}

async function handleHookService(server){
    //Check to see if this service exists already in the server
    let response = await fetch(server + 'PlanDefinition?url=fhir_lab_reports_service');
    let bundle = await response.json();
    if (bundle.total !== 0){
        return bundle.entry[0].resource.id;
    }
    //If not, create one
    let t = await fetchTemplate('PlanDefinition');
    t.url = 'fhir_lab_reports_service';
    t.title = 'Hooks service endpoint for the fhir-lab-reports project';
    t.description = 'Service to serve cards generated by the results of lab reports as created by the fhir-lab-reports-genetic app'
    t.action[0].trigger[0].type = 'named-event';
    t.action[0].trigger[0].name = 'order-select';
    t.action[0].input[0].type = 'Observation?&component-code=51963-7';
    t.action[0].input[0].subjectCodeableConcept.text = 'subject={{context.patientId}}';
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"PlanDefinition\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function createHookResponse(patient, diag_report, res_implication, server){
    let t = await fetchTemplate('RequestGroup');
    t.status = 'draft';
    t.intent = 'proposal';
    t.code.coding[0].system = 'Hooks-response-registry';
    t.code.coding[0].code = 'fhir_lab_reports_response';
    t.subject.reference += patient;
    //Fetch the implications for this test
    let response = await fetch(server + 'Observation/' + res_implication);
    let r = await response.json();
    let implication = r.valueString;
    t.action[0].title = implication;
    t.action[0].priority = 'urgent';
    t.action[0].documentation[0].type = 'documentation';
    t.action[0].documentation[0].label = 'FHIR Lab Reports (SMART app)';
    t.action[0].action[0].prefix = diag_report.toString();
    t.action[0].action[0].title = 'Launch App';
    t.action[0].action[0].description = 'smart';
    t.action[0].action[0].code[0].text = 'http://localhost:3000/smart-launch';
    let entry = JSON.parse('{\"resource\": \"\", \"request\": {\"method\": \"POST\", \"url\": \"RequestGroup\"}}');
    entry.resource = t;
    return postResource(entry,server);
}

async function viewResource(li,type){
    let list = document.getElementsByClassName('selected');
    for (let i = 0; i < list.length; i++) {
        list[i].classList.remove('selected')
    }
    li.className += ' selected';
    let response,r;
    switch(type) {
        case 'pat':
            response = await fetch(localStorage['fhir_server'] + 'Patient/' + localStorage['fhirID_patient']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'pract-clinic':
            response = await fetch(localStorage['fhir_server'] + 'Practitioner/' + localStorage['fhirID_clinic_practitioner']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'loc-clinic':
            response = await fetch(localStorage['fhir_server'] + 'Location/' + localStorage['fhirID_clinic_location']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'enc-clinic':
            response = await fetch(localStorage['fhir_server'] + 'Encounter/' + localStorage['fhirID_clinic_encounter']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'sr-blood':
            response = await fetch(localStorage['fhir_server'] + 'ServiceRequest/' + localStorage['fhirID_blood_request']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'sr-test':
            response = await fetch(localStorage['fhir_server'] + 'ServiceRequest/' + localStorage['fhirID_test_request']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'pract-blood':
            response = await fetch(localStorage['fhir_server'] + 'Practitioner/' + localStorage['fhirID_blood_practitioner']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'enc-blood':
            response = await fetch(localStorage['fhir_server'] + 'Encounter/' + localStorage['fhirID_blood_encounter']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'proc-blood':
            response = await fetch(localStorage['fhir_server'] + 'Procedure/' + localStorage['fhirID_blood_procedure']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'specimen':
            response = await fetch(localStorage['fhir_server'] + 'Specimen/' + localStorage['fhirID_blood_specimen']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'loc-lab':
            response = await fetch(localStorage['fhir_server'] + 'Location/' + localStorage['fhirID_lab_location']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'pract-lab':
            response = await fetch(localStorage['fhir_server'] + 'Practitioner/' + localStorage['fhirID_lab_practitioner']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'proc-test':
            response = await fetch(localStorage['fhir_server'] + 'Procedure/' + localStorage['fhirID_test_procedure']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-imp':
            response = await fetch(localStorage['fhir_server'] + 'Observation/' + localStorage['fhirID_res_implication']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-int':
            response = await fetch(localStorage['fhir_server'] + 'Observation/' + localStorage['fhirID_res_interpretation']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-gen':
            response = await fetch(localStorage['fhir_server'] + 'Observation/' + localStorage['fhirID_res_genotype']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'obs-var':
            response = await fetch(localStorage['fhir_server'] + 'Observation/' + localStorage['fhirID_res_variant']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'dr':
            response = await fetch(localStorage['fhir_server'] + 'DiagnosticReport/' + localStorage['fhirID_diag_report']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'hook-ser':
            response = await fetch(localStorage['fhir_server'] + 'PlanDefinition/' + localStorage['fhirID_hook_service']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        case 'hook-res':
            response = await fetch(localStorage['fhir_server'] + 'RequestGroup/' + localStorage['fhirID_hook_response']);
            r = await response.json();
            document.getElementById('view').innerText = JSON.stringify(r, null, 2);
            break;

        default:
            document.getElementById('view').innerText = 'Invalid selection';

    }

}
