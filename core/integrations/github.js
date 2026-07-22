// ==================================
// VERONICA GITHUB CONNECTOR
// ==================================
//
// Real, functional connector (unlike calendar.js/email.js/cloudStorage.js
// in this same directory, which are interface-only placeholders) --
// GitHub's REST API is simple enough (a bearer token, JSON over HTTPS) to
// implement for real without guessing at a provider choice the way
// "calendar" or "email" would require.
//
// Built on core/integrations/http.js's existing allowlisted request()
// rather than a new HTTP client: api.github.com still has to be in
// SERVICE_ALLOWLIST for any of this to actually reach the network, same
// fail-closed posture as every other outbound call in this system. This
// connector adds its OWN gate on top (GITHUB_TOKEN), so both "is this
// host allowed at all" and "do we have this specific service's
// credentials" must be true.

const http = require("./http");
const credentialManager = require("./credentialManager");
const eventIngestion = require("./eventIngestion");
const log = require("../logging");

const API_ROOT = "https://api.github.com";


function isConfigured(){
    return credentialManager.isConfigured("github");
}


function requireConfigured(){

    if(!isConfigured()){
        throw new Error("GitHub is not configured: set GITHUB_TOKEN to enable.");
    }

}


async function call(pathname, options = {}){

    requireConfigured();

    const response = await http.request(`${API_ROOT}${pathname}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            "User-Agent": "VERONICA",
            Accept: "application/vnd.github+json",
            ...(options.headers || {})
        }
    });

    if(response.status >= 400){
        throw new Error(`GitHub API error ${response.status}: ${response.body}`);
    }

    return JSON.parse(response.body);

}


function getRepo(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

}


function listIssues(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`);

}


function createIssue(owner, repo, { title, body } = {}){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    if(!title){
        throw new Error("An issue title is required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, {
        method: "POST",
        body: { title, body: body || "" }
    });

}


// Branch monitoring, per this phase's capability list.
function listBranches(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`);

}


// Commit monitoring -- `sha` scopes to a branch/tag/commit, matching
// GitHub's own `sha` query param name for this endpoint.
function listCommits(owner, repo, { sha, perPage = 20 } = {}){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    const params = new URLSearchParams({ per_page: String(perPage) });

    if(sha){
        params.set("sha", sha);
    }

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params.toString()}`);

}


// PR monitoring, per this phase's capability list.
function listPullRequests(owner, repo, { state = "open" } = {}){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    const params = new URLSearchParams({ state });

    return call(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params.toString()}`);

}


// A single, human-readable snapshot of a repo's current state -- "a
// repository health summary" from this phase's ask -- built from three
// real, already-implemented endpoints rather than a new one.
async function repositoryHealthSummary(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    const [repoInfo, openIssues, openPullRequests] = await Promise.all([
        getRepo(owner, repo),
        listIssues(owner, repo),
        listPullRequests(owner, repo, { state: "open" })
    ]);

    // GitHub's /issues endpoint also returns pull requests (each carries
    // a `pull_request` key) -- excluded here so "open issues" doesn't
    // double-count PRs already reported separately.
    const realIssues = openIssues.filter(issue => !issue.pull_request);

    return {
        fullName: repoInfo.full_name,
        description: repoInfo.description,
        defaultBranch: repoInfo.default_branch,
        openIssueCount: realIssues.length,
        openPullRequestCount: openPullRequests.length,
        pushedAt: repoInfo.pushed_at,
        url: repoInfo.html_url,
        archived: Boolean(repoInfo.archived),
        stale: repoInfo.pushed_at ? (Date.now() - new Date(repoInfo.pushed_at).getTime()) > (90 * 24 * 60 * 60 * 1000) : null
    };

}


// Polls one repo for new open issues/PRs and ingests each as an external
// event (source:github, per this phase's explicit ask) through the
// shared pipeline (core/integrations/eventIngestion.js) -- never a
// second memory system. Read-only: this never writes to GitHub, and
// dedupes against events already ingested (by `externalId`) so a job
// that runs on an interval (see core/automation/jobs.js) doesn't
// re-ingest the same open issue/PR every tick.
async function pollRepository(owner, repo){

    if(!owner || !repo){
        throw new Error("owner and repo are required");
    }

    const [openPullRequests, openIssues] = await Promise.all([
        listPullRequests(owner, repo, { state: "open" }),
        listIssues(owner, repo)
    ]);

    const alreadyIngested = new Set(
        eventIngestion.recentEvents({ source: "github" })
            .map(entry => entry.metadata && entry.metadata.externalId)
            .filter(Boolean)
    );

    const ingested = [];

    for(const pr of openPullRequests){

        const externalId = `pr:${owner}/${repo}#${pr.number}`;

        if(alreadyIngested.has(externalId)){
            continue;
        }

        ingested.push(eventIngestion.ingest({
            source: "github",
            kind: "pull_request",
            summary: `Open PR #${pr.number} in ${owner}/${repo}: ${pr.title}`,
            occurredAt: pr.created_at,
            metadata: { externalId, owner, repo, number: pr.number, title: pr.title, url: pr.html_url }
        }));

    }

    for(const issue of openIssues){

        if(issue.pull_request){
            continue; // already covered above, via listPullRequests
        }

        const externalId = `issue:${owner}/${repo}#${issue.number}`;

        if(alreadyIngested.has(externalId)){
            continue;
        }

        ingested.push(eventIngestion.ingest({
            source: "github",
            kind: "issue",
            summary: `Open issue #${issue.number} in ${owner}/${repo}: ${issue.title}`,
            occurredAt: issue.created_at,
            metadata: { externalId, owner, repo, number: issue.number, title: issue.title, url: issue.html_url }
        }));

    }

    log.info("github", `Polled ${owner}/${repo}: ${ingested.length} new event(s) ingested`);

    return ingested;

}


function status(){

    return {
        id: "github",
        configured: isConfigured(),
        requiredEnv: ["GITHUB_TOKEN"],
        note: isConfigured()
            ? "Configured. Also requires \"api.github.com\" in SERVICE_ALLOWLIST."
            : "Not configured -- set GITHUB_TOKEN to enable."
    };

}


module.exports = {
    isConfigured, status, getRepo, listIssues, createIssue,
    listBranches, listCommits, listPullRequests,
    repositoryHealthSummary, pollRepository
};
