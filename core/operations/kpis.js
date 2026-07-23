// ==================================
// VERONICA KPI TRACKING
// ==================================
//
// Phase 46 (Business Operations Division production-readiness). A KPI
// is a real, named target with a real, updatable actual value -- an
// ordinary memory entry, same pattern as everything else. `direction`
// matters for status: some KPIs want higher-is-better (revenue),
// others lower-is-better (defect rate, churn) -- defaulting to
// higher-is-better would silently mis-grade half of all real KPIs.

const memory = require("../memory");

const KPI_TAG = "operations-kpi";

const DIRECTIONS = ["higher_is_better", "lower_is_better"];


function toKPI(entry){

    const meta = entry.metadata || {};

    return {
        id: entry.id,
        name: entry.content,
        department: meta.department || null,
        target: meta.target,
        actual: typeof meta.actual === "number" ? meta.actual : null,
        unit: meta.unit || null,
        period: meta.period || null,
        direction: meta.direction || "higher_is_better",
        created: entry.created,
        updated: entry.updated
    };

}


function requireEntry(id){

    const entry = memory.view().find(m => m.id === id && (m.tags || []).includes(KPI_TAG));

    if(!entry){
        throw new Error(`Unknown KPI: "${id}"`);
    }

    return entry;

}


// input: { name, department?, target, unit?, period?, direction? }
function createKPI(input = {}){

    if(!input.name){
        throw new Error("A KPI name is required");
    }

    if(!Number.isFinite(input.target)){
        throw new Error("A numeric target is required");
    }

    const direction = input.direction || "higher_is_better";

    if(!DIRECTIONS.includes(direction)){
        throw new Error(`Invalid direction: "${direction}" (must be one of ${DIRECTIONS.join(", ")})`);
    }

    const entry = memory.remember({
        content: input.name,
        type: "businesses",
        importance: 3,
        tags: [KPI_TAG],
        source: "operations-kpis",
        metadata: {
            department: input.department || null,
            target: input.target,
            actual: null,
            unit: input.unit || null,
            period: input.period || null,
            direction
        }
    });

    return toKPI(entry);

}


function listKPIs(department){

    return memory.filter({ tag: KPI_TAG })
        .filter(entry => !department || entry.metadata.department === department)
        .map(toKPI);

}


function getKPI(kpiId){
    return toKPI(requireEntry(kpiId));
}


function recordActual(kpiId, actual){

    if(!Number.isFinite(actual)){
        throw new Error("A numeric actual value is required");
    }

    requireEntry(kpiId);

    const updated = memory.update(kpiId, { metadata: { actual } });

    return toKPI(updated);

}


// Real, deterministic on-track status -- "higher is better" is on
// track at or above target; "lower is better" is on track at or below
// target. No actual recorded yet means no status can honestly be
// reported.
function kpiStatus(kpiId){

    const kpi = getKPI(kpiId);

    if(kpi.actual === null){
        return { ...kpi, onTrack: null };
    }

    const onTrack = kpi.direction === "higher_is_better"
        ? kpi.actual >= kpi.target
        : kpi.actual <= kpi.target;

    return { ...kpi, onTrack };

}


module.exports = { KPI_TAG, DIRECTIONS, createKPI, listKPIs, getKPI, recordActual, kpiStatus };
