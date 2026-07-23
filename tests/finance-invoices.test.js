const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DB_PATH = path.join(__dirname, "..", "core", "memory", "database.json");
const DB_BACKUP = path.join(os.tmpdir(), `veronica-database-backup-financeinvoices-${process.pid}.json`);

const GRAPH_PATH = path.join(__dirname, "..", "core", "knowledge", "graph.json");
const GRAPH_BACKUP = path.join(os.tmpdir(), `veronica-graph-backup-financeinvoices-${process.pid}.json`);

test.before(() => {
    fs.copyFileSync(DB_PATH, DB_BACKUP);
    fs.copyFileSync(GRAPH_PATH, GRAPH_BACKUP);
});

test.after(() => {
    fs.copyFileSync(DB_BACKUP, DB_PATH);
    fs.unlinkSync(DB_BACKUP);
    fs.copyFileSync(GRAPH_BACKUP, GRAPH_PATH);
    fs.unlinkSync(GRAPH_BACKUP);
});

const CompanyManager = require("../core/executive/companyManager");
const invoices = require("../core/finance/invoices");


function makeCompany(name){
    return new CompanyManager().createCompany({ name });
}


test("createInvoice() requires companyId/clientName/amount, and rejects an unknown company", () => {

    assert.throws(() => invoices.createInvoice({ clientName: "X", amount: 100 }));
    assert.throws(() => invoices.createInvoice({ companyId: "not-a-real-id", clientName: "X", amount: 100 }));

    const company = makeCompany("Invoice Validation Co XQZFI1");
    assert.throws(() => invoices.createInvoice({ companyId: company.id, amount: 100 }));
    assert.throws(() => invoices.createInvoice({ companyId: company.id, clientName: "X" }));

});


test("createInvoice() starts at \"draft\", not overdue", () => {

    const company = makeCompany("Invoice Shape Co XQZFI2");

    const invoice = invoices.createInvoice({ companyId: company.id, clientName: "Acme XQZFI2", amount: 1000, dueDate: "2020-01-01" });

    assert.strictEqual(invoice.status, "draft");
    // Not overdue -- overdue only applies once actually sent, even with
    // a due date in the past (a draft was never billed).
    assert.strictEqual(invoice.overdue, false);

});


test("setInvoiceStatus() validates against the real enum", () => {

    const company = makeCompany("Invoice Status Co XQZFI3");
    const invoice = invoices.createInvoice({ companyId: company.id, clientName: "Acme XQZFI3", amount: 500 });

    assert.strictEqual(invoices.setInvoiceStatus(invoice.id, "sent"), "sent");
    assert.throws(() => invoices.setInvoiceStatus(invoice.id, "not-a-real-status"));

});


test("overdue is derived at read time from a real past due date on a \"sent\" invoice", () => {

    const company = makeCompany("Invoice Overdue Co XQZFI4");
    const invoice = invoices.createInvoice({ companyId: company.id, clientName: "Acme XQZFI4", amount: 750, dueDate: "2020-01-01" });

    invoices.setInvoiceStatus(invoice.id, "sent");

    assert.strictEqual(invoices.getInvoice(invoice.id).overdue, true);

    invoices.setInvoiceStatus(invoice.id, "paid");
    assert.strictEqual(invoices.getInvoice(invoice.id).overdue, false);

});


test("accountsReceivable() sums only \"sent\" invoices, excluding draft/paid/void", () => {

    const company = makeCompany("Invoice AR Co XQZFI5");

    const sent = invoices.createInvoice({ companyId: company.id, clientName: "Sent Client XQZFI5", amount: 1000 });
    invoices.setInvoiceStatus(sent.id, "sent");

    const paid = invoices.createInvoice({ companyId: company.id, clientName: "Paid Client XQZFI5", amount: 2000 });
    invoices.setInvoiceStatus(paid.id, "sent");
    invoices.setInvoiceStatus(paid.id, "paid");

    invoices.createInvoice({ companyId: company.id, clientName: "Draft Client XQZFI5", amount: 3000 });

    assert.strictEqual(invoices.accountsReceivable(company.id), 1000);

});
