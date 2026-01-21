/**
 * Tree Builder - constructs etymology trees from database relationships
 *
 * Takes a term ID and recursively builds a tree by following relationships.
 * Handles cycles, depth limits, and maintains proper ordering.
 */
import { getTermById, getRelationships } from '../db/database.js';

/**
 * Build an etymology tree starting from a term
 * @param {string} termId - The root term ID
 * @param {number} maxDepth - Maximum recursion depth (default 10)
 * @returns {Object|null} - Tree node object or null if term not found
 */
export function buildTree(termId, maxDepth = 10) {
    const visited = new Set();
    return buildTreeRecursive(termId, maxDepth, visited);
}

/**
 * Recursive helper for building the tree
 * @param {string} termId - Current term ID
 * @param {number} depth - Remaining depth
 * @param {Set} visited - Set of visited term IDs (for cycle detection)
 * @returns {Object|null}
 */
function buildTreeRecursive(termId, depth, visited) {
    // Base cases
    if (!termId) return null;
    if (depth <= 0) return null;
    if (visited.has(termId)) return null; // Cycle detected

    // Mark as visited
    visited.add(termId);

    // Get the term from database
    const term = getTermById(termId);
    if (!term) {
        visited.delete(termId);
        return null;
    }

    // Create the node
    const node = {
        id: term.id,
        term: term.term,
        lang: term.lang,
        children: []
    };

    // Get relationships (etymology sources)
    const relationships = getRelationships(termId);

    // Process each relationship
    for (const rel of relationships) {
        // Skip if no target (group markers have null to_id)
        if (!rel.to_id) continue;

        // Recursively build child tree
        const childNode = buildTreeRecursive(rel.to_id, depth - 1, visited);

        if (childNode) {
            // Add relationship metadata to the child
            childNode.reltype = rel.reltype;
            childNode.position = rel.position;
            childNode.groupTag = rel.group_tag;
            node.children.push(childNode);
        }
    }

    // Sort children by position
    node.children.sort((a, b) => (a.position || 0) - (b.position || 0));

    return node;
}

/**
 * Flatten a tree into an array of nodes with parent references
 * Useful for rendering - each node gets x,y coordinates
 * @param {Object} tree - The tree root
 * @returns {Array<Object>} - Flat array of nodes
 */
export function flattenTree(tree) {
    const nodes = [];
    flattenRecursive(tree, null, nodes);
    return nodes;
}

/**
 * Recursive helper for flattening
 */
function flattenRecursive(node, parent, nodes) {
    if (!node) return;

    const flatNode = {
        id: node.id,
        term: node.term,
        lang: node.lang,
        reltype: node.reltype || null,
        parent: parent,
        children: [],
        // x, y will be set by layout algorithm
        x: 0,
        y: 0
    };

    nodes.push(flatNode);

    // Process children
    for (const child of node.children || []) {
        const childFlat = flattenRecursive(child, flatNode, nodes);
        if (childFlat) {
            flatNode.children.push(childFlat);
        }
    }

    return flatNode;
}

/**
 * Get the depth of a tree
 * @param {Object} tree - The tree root
 * @returns {number}
 */
export function getTreeDepth(tree) {
    if (!tree) return 0;
    if (!tree.children || tree.children.length === 0) return 1;

    let maxChildDepth = 0;
    for (const child of tree.children) {
        maxChildDepth = Math.max(maxChildDepth, getTreeDepth(child));
    }

    return 1 + maxChildDepth;
}

/**
 * Count total nodes in a tree
 * @param {Object} tree - The tree root
 * @returns {number}
 */
export function countNodes(tree) {
    if (!tree) return 0;

    let count = 1;
    for (const child of tree.children || []) {
        count += countNodes(child);
    }

    return count;
}
