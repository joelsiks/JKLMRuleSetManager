// ==UserScript==
// @name         JKLMRuleSetManager
// @namespace    http://tampermonkey.net/
// @version      2025-01-31
// @description  A user script for saving and applying sets of rules for PopSauce on https://jklm.fun/
// @author       Joel Sikström
// @match        *://*.jklm.fun/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @icon         https://jklm.fun/images/icon512.png
// ==/UserScript==

const BAD_RESULT = -1;

const SAVED_RULES_GMKEY = "savedRules";
const RULE_SET_SELECTOR_ID = "ruleSetSelector";
const RULE_SET_SELECTOR_NOOP = "none";

const RULE_SET_DEFAULT = {
    name: "default",

    scoreGoal: 100, // First to reach this score wins
    scoring: "constant", // One of of: "constant" (all players receive equal points), "timeBased" (weighted towards fastest answer)
    challengeDuration: 15, // Number of seconds for guessing

    // Limited to 20 categories. The server will end the WebSocket connection if more are sent.
    // The UI/game state enforces this limit so we don't bother with the limit in this script.
    tags: [
        {op: "difference", tag: "Anime & Manga"},
        {op: "difference", tag: "Animated Movies"},
        {op: "difference", tag: "Architecture"},
        {op: "difference", tag: "Art"},
        {op: "difference", tag: "Capital cities"},
        {op: "difference", tag: "Countries"},
        {op: "difference", tag: "Flags"},
        {op: "difference", tag: "French"},
        {op: "difference", tag: "Game of Thrones"},
        {op: "difference", tag: "Geography"},
        {op: "difference", tag: "K-pop"},
        {op: "difference", tag: "Literature"},
        {op: "difference", tag: "Local flags"},
        {op: "difference", tag: "Movies"},
        {op: "difference", tag: "Personalities"},
        {op: "difference", tag: "Pokémon"},
        {op: "difference", tag: "Rap"},
        {op: "difference", tag: "Sport"},
        {op: "difference", tag: "Texts"},
        {op: "difference", tag: "The Witcher"}
    ]
};

function RSLog(message) {
    console.log("[RS]", message);
}

function forceShowRules(show) {
    socket.emit("setRulesLocked", !show);
}

function installRuleSet(ruleSet) {
    const alreadyShowingRules = showRules;

    // Rules must be "showing" to be able to send socket messages about game rules
    forceShowRules(true);

    RSLog("Sending websocket requests for initializing the game rules");

    // Set category selection
    socket.emit("setTagOps", ruleSet.tags);

    // Update rules
    socket.emit("setRules", {
        scoreGoal: ruleSet.scoreGoal,
        scoring: ruleSet.scoring,
        challengeDuration: ruleSet.challengeDuration
    });

    // Only set this if the user is not showing rules before we installed a rule set.
    // Forcing the "ShowRules" to false while the user has the rules menu open will
    // make them unable to edit the rules until the "re-open" the menu.
    if (!alreadyShowingRules) {
        forceShowRules(false);
    }
}

function isDefaultSetName(name) {
    return name.toLowerCase() === RULE_SET_DEFAULT.name.toLowerCase();
}

function getRuleSet(name) {
    const savedRuleSets = GM_getValue(SAVED_RULES_GMKEY, []);
    return savedRuleSets.find(ruleSet => ruleSet.name === name) || BAD_RESULT;
}

function setRuleSet(ruleSet) {
    if (isDefaultSetName(ruleSet.name)) {
        alert(`The default rule set "${RULE_SET_DEFAULT.name}" cannot be modified.`);
        return;
    }

    const savedRuleSets = GM_getValue(SAVED_RULES_GMKEY, []);
    const existingIndex = savedRuleSets.findIndex(r => r.name === ruleSet.name);

    if (existingIndex !== -1) {
        const confirmReplace = confirm(`A rule set named "${ruleSet.name}" already exists. Overwrite it?`);
        if (!confirmReplace) {
            return;
        }

        savedRuleSets[existingIndex] = ruleSet; // Update existing
    } else {
        savedRuleSets.push(ruleSet); // Add new
    }

    GM_setValue(SAVED_RULES_GMKEY, savedRuleSets);
}

function setDefaultRuleSet() {
    const savedRuleSets = GM_getValue(SAVED_RULES_GMKEY, []);
    const existingIndex = savedRuleSets.findIndex(r => r.name === RULE_SET_DEFAULT.name);

    // Not installed
    if (existingIndex === -1) {
        GM_setValue(SAVED_RULES_GMKEY, [RULE_SET_DEFAULT]);
    }
}

function getValueOfInputField(name) {
    return document.querySelector(`.${name} > *:nth-child(3) > *`)?.value || "";
}

function getTagsFromInput() {
    return Array.from(document.getElementsByClassName("list darkScrollbar")[0]?.children || []).map(element => ({
        op: element.classList[1],
        tag: element.getAttribute("data-tag")
    }));
}

function readCurrentRuleSetFromInput(name) {
    const scoreGoal = Number(getValueOfInputField("scoreGoal"));
    const scoring = getValueOfInputField("scoring");
    const challengeDuration = Number(getValueOfInputField("challengeDuration"));
    const tags = getTagsFromInput();

    return { name, scoreGoal, scoring, challengeDuration, tags };
}

function setCurrentRuleSetToSelected() {
    const ruleSetSelector = document.getElementById(RULE_SET_SELECTOR_ID);

    const selection = ruleSetSelector.value;
    if (selection == RULE_SET_SELECTOR_NOOP) {
        // Do nothing
        return;
    }

    RSLog(`Installing rules from preset with name "${selection}"`);

    const ruleSet = getRuleSet(selection);
    if (ruleSet != BAD_RESULT) {
        installRuleSet(ruleSet);
    }

    // Restore selection to default
    ruleSetSelector.value = RULE_SET_SELECTOR_NOOP;
}

function populateRuleSetSelector() {
    const ruleSetSelector = document.getElementById(RULE_SET_SELECTOR_ID);
    if (!ruleSetSelector) {
        return;
    }

    // Clear existing options
    ruleSetSelector.innerHTML = "";

    // Create and append the default "Install rule set" option
    const defaultOption = document.createElement("option");
    defaultOption.value = RULE_SET_SELECTOR_NOOP;
    defaultOption.textContent = "Install rule set";
    ruleSetSelector.appendChild(defaultOption);

    // Retrieve saved rule sets and add them as options
    const savedRuleSets = GM_getValue(SAVED_RULES_GMKEY, []);
    savedRuleSets.forEach(ruleSet => {
        const option = document.createElement("option");
        option.value = encodeURIComponent(ruleSet.name);  // URL encode for the value
        option.textContent = escapeHTML(ruleSet.name);  // Safely escape the name for display
        ruleSetSelector.appendChild(option);
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>"']/g, match => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[match]);
}

function saveCurrentRuleSet() {
    const ruleSetName = prompt("What should the rule set be called?")?.trim();
    if (ruleSetName === null || ruleSetName === "") {
        // Exit if the user clicks "Cancel" or enters an empty string
        return;
    }

    if (isDefaultSetName(ruleSet.name)) {
        alert(`The default rule set "${RULE_SET_DEFAULT.name}" cannot be overwritten.`);
        return;
    }

    const ruleSet = readCurrentRuleSetFromInput(ruleSetName);
    RSLog(`Saving currently selected state with name "${ruleSetName}"`);

    setRuleSet(ruleSet);
    populateRuleSetSelector();
}

function removeRuleSet() {
    const ruleSetName = prompt("Enter the name of the rule set to remove:")?.trim();
    if (ruleSetName === null || ruleSetName === "") {
        // Exit if the user clicks "Cancel" or enters an empty string
        return;
    }

    if (isDefaultSetName(ruleSet.name)) {
        alert(`The default rule set "${RULE_SET_DEFAULT.name}" cannot be removed.`);
        return;
    }

    const savedRuleSets = GM_getValue(SAVED_RULES_GMKEY, []);
    const index = savedRuleSets.findIndex(ruleSet => ruleSet.name === ruleSetName);

    if (index === -1) {
        alert(`Rule set "${ruleSetName}" not found.`);
        return;
    }

    // Remove the rule set
    savedRuleSets.splice(index, 1);
    GM_setValue(SAVED_RULES_GMKEY, savedRuleSets);

    RSLog(`Removed rule set "${ruleSetName}"`);
    alert(`Rule set "${ruleSetName}" has been removed.`);

    populateRuleSetSelector();
}

function installUtility() {
    RSLog("Installing utility");

    const bottomJoin = document.getElementsByClassName("join")[0];

    if (!bottomJoin) {
        RSLog("Error: Unable to install utility buttons. Script implicitly disabled.");
        return;
    }

    // Remove all whitespace from the bottomJoin
    bottomJoin.innerHTML = bottomJoin.innerHTML.trim().replace(/>\s+</g, '><');

    function appendWithSpacing(element) {
        element.style.marginLeft = "8px";
        bottomJoin.appendChild(element);
    }

    function createAndInstallButton(text, onClickFunction) {
        const newButton = document.createElement("button");
        newButton.className = "styled joinRound";
        newButton.innerText = text;
        newButton.onclick = onClickFunction;
        appendWithSpacing(newButton);
    }

    // Add buttons
    createAndInstallButton("Save Rule Set", saveCurrentRuleSet);
    createAndInstallButton("Remove Rule Set", removeRuleSet);

    // Create, setup and install rule set selector
    const ruleSetSelectorSelect = document.createElement("select");
    ruleSetSelectorSelect.id = RULE_SET_SELECTOR_ID;
    ruleSetSelectorSelect.onchange = setCurrentRuleSetToSelected;
    appendWithSpacing(ruleSetSelectorSelect);

    populateRuleSetSelector();
}

setDefaultRuleSet();
installUtility();