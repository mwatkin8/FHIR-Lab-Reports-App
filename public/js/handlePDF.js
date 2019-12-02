function loadPDF(){
    window.alert('The sample report is the positive result of the test:\n\"Statin Sensitivity SLCO1B1, 1 Variant\"\nAny other report won\'t populate correctly. \n\nThis demonstrates one of the main purposes for this project which is to highlight the need for structured input rather than PDF.\n\nPlease refresh page and use the sample report.');
    let upload = document.getElementById('pdf-upload').files[0];
    let reader = new FileReader();
    reader.onload = async function () {
        let binary;
        let binary_reader = new FileReader();
        binary_reader.onload = function () {
            binary = binary_reader.result;
        };
        await binary_reader.readAsBinaryString(upload);
        let typedarray = new Uint8Array(this.result);
        let pdf = await pdfjsLib.getDocument(typedarray);
        let page1 = await pdf.getPage(1);
        let page2 = await pdf.getPage(2);
        let content1 = await page1.getTextContent();
        let content2 = await page2.getTextContent();
        await parsePDF(content1, content2, binary);
    };
    reader.readAsArrayBuffer(upload);
}

async function samplePDF(){
    let pdf = await pdfjsLib.getDocument('../sample.pdf');
    let page1 = await pdf.getPage(1);
    let page2 = await pdf.getPage(2);
    let content1 = await page1.getTextContent();
    let content2 = await page2.getTextContent();
    let response = await fetch('../sample.pdf');
    let b = await response.blob();
    let reader = new FileReader();
    reader.onloadend = function() {
        let url = reader.result;
        let base64 = url.split(',')[1];
        parsePDF(content1, content2, base64);
    };
    reader.readAsDataURL(b);
}

function parsePDF(content1, content2, binary){
    localStorage['pdf-binary'] = binary;

    let fields = content1.items;
    console.log('Report pg.1 contents');
    console.log(fields);
    document.getElementsByClassName('patient-report')[0].innerHTML += fields[43].str;
    document.getElementsByClassName('patient-report')[1].innerHTML += fields[43].str;
    document.getElementById('client').value = fields[2].str;
    document.getElementById('address').value = fields[3].str + '\n' + fields[4].str + '\n' + fields[5].str;
    document.getElementById('physician').value = fields[8].str;
    document.getElementById('test-name').value = fields[9].str;
    document.getElementById('test-code').value = fields[10].str.split(' code ')[1];
    document.getElementById('specimen-title').value = fields[11].str;
    document.getElementById('specimen').value = fields[12].str;
    document.getElementById('genotype-title').value = fields[13].str;
    document.getElementById('genotype-result').value = fields[14].str;
    let info1 = '';
    for (let i = 15; i < 25; i++){
        if (fields[i].str === ' '){
            info1 += '\n\n'
        }
        else{
            info1 += fields[i].str
        }
    }
    document.getElementById('info1').value = info1;
    document.getElementById('patient').value = fields[25].str.split(': ')[1];
    document.getElementById('dob').value = fields[27].str;
    document.getElementById('gender').value = fields[29].str;
    document.getElementById('patient-identifiers').value = fields[31].str;
    document.getElementById('visit-number').value = fields[33].str;
    //document.getElementById('collection-date').value = fields[35].str;
    let report_info = '';
    for (let i = 35; i < 40; i++){
        report_info += fields[i].str + '  \n';
    }
    report_info += fields[40].str + '  ';
    document.getElementById('report-info1').value = report_info;
    fields = content2.items;
    console.log('Report pg.2 contents:');
    console.log(fields);
    let info2 = '';
    let first = true;
    for (let i = 0; i < 100; i++){
        if (fields[i].str.includes(':')){
            if (first !== true) {
                info2 += '\n\n';
            }
            else{first = false;}
        }
        info2 += fields[i].str
    }
    document.getElementById('info2').value = info2;
    document.getElementById('proc-1').value = fields[107].str;
    document.getElementById('acc-1').value = fields[108].str;
    document.getElementById('coll-1').value = fields[109].str;
    document.getElementById('rec-1').value = fields[110].str;
    document.getElementById('ver_re-1').value = fields[111].str;
    document.getElementById('proc-2').value = fields[112].str;
    document.getElementById('acc-2').value = fields[113].str;
    document.getElementById('coll-2').value = fields[114].str;
    document.getElementById('rec-2').value = fields[115].str;
    document.getElementById('ver_re-2').value = fields[116].str;
    report_info = '';
    first = true;
    for (let i = 117; i < 129; i++){
        if (fields[i].str.includes(':') || fields[i].str === 'Page '){
            if (first !== true) {
                report_info += '  \n';
            }
            else{first = false;}
        }
        report_info += fields[i].str
    }
    report_info += fields[129].str + fields[130].str + '  \n' + fields[131].str + '  ';
    document.getElementById('report-info2').value = report_info;
}