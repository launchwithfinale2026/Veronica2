// ==================================
// VERONICA FINANCE INVOICE ENGINE
// ==================================
//
// Phase 43 (Finance Division production-readiness). An invoice is an
// ordinary memory entry (type "businesses", tagged company:<id> +
// "finance-invoice"), same pattern as every other company-scoped entity
// in this codebase.

const memory = require("../memory");

const INVOICE_TAG = "finance-invoice";

const STATUSES = ["draft", "sent", "paid", "void"];


function requireCompanyExists(companyId){

    const CompanyManager = require("../executive/companyManager");

    const entry = memory.view().find(
        m => m.id === companyId && (m.tags || []).includes(CompanyManager.TAG)
    );

    if(!entry){
        throw new Error(`Unknown company: "${companyId}"`);
    }

}


function toInvoice(entry){

    const meta = entry.metadata || {};

    // "overdue" is DERIVED at read time, not a stored status -- a
    // persisted overdue flag would go stale the moment a day passes
    // without VERONICA touching the invoice; computing it fresh every
    // read means it's always accurate.
    const overdue = meta.status === "sent" &&
        Boolean(meta.dueDate) &&
        new Date(meta.dueDate).getTime() < Date.now();

    return {
        id: entry.id,
        companyId: meta.companyId,
        clientName: meta.clientName,
        amount: meta.amount,
        dueDate: meta.dueDate || null,
        status: meta.status || "draft",
        overdue,
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(INVOICE_TAG));

    if(!entry){
        throw new Error(`Unknown invoice: "${id}"`);
    }

    return entry;

}


// input: { companyId, clientName, amount, dueDate? }
function createInvoice(input = {}){

    if(!input.companyId){
        throw new Error("A companyId is required");
    }

    if(!input.clientName){
        throw new Error("A clientName is required");
    }

    if(!Number.isFinite(input.amount)){
        throw new Error("A numeric amount is required");
    }

    requireCompanyExists(input.companyId);

    const entry = memory.remember({
        content: `Invoice for ${input.clientName}`,
        type: "businesses",
        importance: 4,
        tags: [INVOICE_TAG, `company:${input.companyId}`],
        source: "finance-invoices",
        metadata: {
            companyId: input.companyId,
            clientName: input.clientName,
            amount: input.amount,
            dueDate: input.dueDate || null,
            status: "draft"
        }
    });

    return toInvoice(entry);

}


function listInvoices(companyId){

    return memory.filter({ tag: INVOICE_TAG })
        .filter(entry => (entry.tags || []).includes(`company:${companyId}`))
        .map(toInvoice);

}


function getInvoice(invoiceId){
    return toInvoice(requireEntry(invoiceId));
}


function setInvoiceStatus(invoiceId, status){

    if(!STATUSES.includes(status)){
        throw new Error(`Invalid invoice status: "${status}" (must be one of ${STATUSES.join(", ")})`);
    }

    requireEntry(invoiceId);

    const updated = memory.update(invoiceId, { metadata: { status } });

    return updated.metadata.status;

}


// Real accounts receivable: every invoice that's been sent (whether
// overdue or not) but not yet paid -- money genuinely owed to the
// company right now.
function accountsReceivable(companyId){

    return listInvoices(companyId)
        .filter(invoice => invoice.status === "sent")
        .reduce((sum, invoice) => sum + invoice.amount, 0);

}


module.exports = { INVOICE_TAG, STATUSES, createInvoice, listInvoices, getInvoice, setInvoiceStatus, accountsReceivable };
