class Person {
    name = "";
    gender = "unknown"; // "male" | "female" | "unknown"
    mother;
    father;
    children = [];
    id = null; // for SQL integration

    constructor(name, gender = "unknown", mother = undefined, father = undefined) {
        this.name = name;
        this.gender = gender;
        if (mother) this.setMother(mother);
        if (father) this.setFather(father);
    }

    getParents() {
        return [this.mother, this.father].filter(p => p);
    }

    setMother(person) {
        this.mother = person;
        if (!person.children.includes(this)) {
            person.children.push(this);
        }
    }

    setFather(person) {
        this.father = person;
        if (!person.children.includes(this)) {
            person.children.push(this);
        }
    }

    // ---------- Core graph helpers ----------

    // Map<Person, generationsBack>  (0 = self, 1 = parent, 2 = grandparent, ...)
    getAncestorsMap(maxDepth = 20) {
        const map = new Map();
        const queue = [{ person: this, depth: 0 }];

        while (queue.length) {
            const { person, depth } = queue.shift();
            if (depth > maxDepth) continue;

            if (!map.has(person)) {
                map.set(person, depth);
                for (const parent of person.getParents()) {
                    queue.push({ person: parent, depth: depth + 1 });
                }
            }
        }

        return map;
    }

    // Map<Person, generationsForward> (0 = self, 1 = child, 2 = grandchild, ...)
    getDescendantsMap(maxDepth = 20) {
        const map = new Map();
        const queue = [{ person: this, depth: 0 }];

        while (queue.length) {
            const { person, depth } = queue.shift();
            if (depth > maxDepth) continue;

            if (!map.has(person)) {
                map.set(person, depth);
                for (const child of person.children) {
                    queue.push({ person: child, depth: depth + 1 });
                }
            }
        }

        return map;
    }

    // ---------- Name helpers ----------

    getAncestorName(generations) {
        if (generations === 1) return "parent";
        if (generations === 2) return "grandparent";
        const greats = "great ".repeat(generations - 2);
        return `${greats}grandparent`;
    }

    getDescendantName(generations) {
        if (generations === 1) return "child";
        if (generations === 2) return "grandchild";
        const greats = "great ".repeat(generations - 2);
        return `${greats}grandchild`;
    }

    getCousinLevelName(level) {
        if (level === 0) return "siblings";
        if (level === 1) return "1st cousins";
        if (level === 2) return "2nd cousins";
        if (level === 3) return "3rd cousins";
        return `${level}th cousins`;
    }

    getUncleAuntName(greats, gender) {
        const base = gender === "male" ? "uncle" :
                     gender === "female" ? "aunt" : "pibling";
        if (greats <= 0) return base;
        return "great ".repeat(greats) + base;
    }

    getNephewNieceName(greats, gender) {
        const base = gender === "male" ? "nephew" :
                     gender === "female" ? "niece" : "nibling";
        if (greats <= 0) return base;
        return "great ".repeat(greats) + base;
    }

    // ---------- Relationship classification ----------

    // classify a single path via one common ancestor
    classifyViaCommonAncestor(person1, person2, commonAncestor, g1, g2) {
        // g1, g2: generations from person1/2 up to commonAncestor (0 = self)

        // direct ancestor/descendant
        if (g1 === 0 && g2 > 0) {
            const name = this.getDescendantName(g2);
            return {
                type: "DirectDescendant",
                distance: g1 + g2,
                relationString: `${person2.name} is the ${name} of ${person1.name}`,
                commonAncestor: person1.name
            };
        }
        if (g2 === 0 && g1 > 0) {
            const name = this.getDescendantName(g1);
            return {
                type: "DirectDescendant",
                distance: g1 + g2,
                relationString: `${person1.name} is the ${name} of ${person2.name}`,
                commonAncestor: person2.name
            };
        }

        // siblings
        if (g1 === 1 && g2 === 1) {
            return {
                type: "Siblings",
                distance: g1 + g2,
                relationString: `${person1.name} and ${person2.name} are siblings`,
                commonAncestor: commonAncestor.name
            };
        }

        // avuncular (uncle/aunt ↔ nephew/niece)
        if (Math.min(g1, g2) === 1 && g1 !== g2) {
            const diff = Math.abs(g1 - g2) - 1; // number of "greats"
            if (g1 === 1 && g2 > 1) {
                // person1 is uncle/aunt of person2
                const title = this.getUncleAuntName(diff, person1.gender);
                return {
                    type: "Avuncular",
                    distance: g1 + g2,
                    relationString: `${person1.name} is the ${title} of ${person2.name}`,
                    commonAncestor: commonAncestor.name
                };
            } else if (g2 === 1 && g1 > 1) {
                // person2 is uncle/aunt of person1
                const title = this.getUncleAuntName(diff, person2.gender);
                return {
                    type: "Avuncular",
                    distance: g1 + g2,
                    relationString: `${person2.name} is the ${title} of ${person1.name}`,
                    commonAncestor: commonAncestor.name
                };
            }
        }

        // cousins (including removed)
        if (g1 > 0 && g2 > 0) {
            const cousinLevel = Math.min(g1, g2) - 1;
            const removed = Math.abs(g1 - g2);
            let base = this.getCousinLevelName(cousinLevel);
            if (removed > 0) {
                base += ` ${removed} times removed`;
            }
            return {
                type: "Cousins",
                distance: g1 + g2,
                relationString: `${person1.name} and ${person2.name} are ${base}`,
                commonAncestor: commonAncestor.name
            };
        }

        // fallback
        return null;
    }

    // rank types when distance ties
    relationTypePriority(type) {
        switch (type) {
            case "DirectDescendant": return 1;
            case "Siblings":         return 2;
            case "Avuncular":        return 3;
            case "Cousins":          return 4;
            default:                 return 99;
        }
    }

    // ---------- Public API ----------

    // returns { closest, allRelations }
    findAllRelations(person1, person2, maxDepth = 20) {
        if (person1 === person2) {
            const rel = {
                type: "Same",
                distance: 0,
                relationString: `${person1.name} is the same person as ${person2.name}`,
                commonAncestor: person1.name
            };
            return { closest: rel, allRelations: [rel] };
        }

        const ancA = person1.getAncestorsMap(maxDepth);
        const ancB = person2.getAncestorsMap(maxDepth);

        const allRelations = [];

        // direct ancestor/descendant via maps
        if (ancA.has(person2)) {
            const g = ancA.get(person2);
            if (g > 0) {
                const name = this.getAncestorName(g);
                allRelations.push({
                    type: "DirectAncestor",
                    distance: g,
                    relationString: `${person2.name} is the ${name} of ${person1.name}`,
                    commonAncestor: person2.name
                });
            }
        }
        if (ancB.has(person1)) {
            const g = ancB.get(person1);
            if (g > 0) {
                const name = this.getAncestorName(g);
                allRelations.push({
                    type: "DirectAncestor",
                    distance: g,
                    relationString: `${person1.name} is the ${name} of ${person2.name}`,
                    commonAncestor: person1.name
                });
            }
        }

        // all shared ancestors → all collateral relations
        for (const [ancestor, g1] of ancA.entries()) {
            if (!ancB.has(ancestor)) continue;
            const g2 = ancB.get(ancestor);

            // skip the trivial self/self case
            if (ancestor === person1 || ancestor === person2) continue;

            const rel = this.classifyViaCommonAncestor(person1, person2, ancestor, g1, g2);
            if (rel) {
                allRelations.push(rel);
            }
        }

        if (allRelations.length === 0) {
            return {
                closest: null,
                allRelations: []
            };
        }

        // pick closest: min distance, then by type priority
        allRelations.sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            return this.relationTypePriority(a.type) - this.relationTypePriority(b.type);
        });

        return {
            closest: allRelations[0],
            allRelations
        };
    }

    // backwards‑compatible single‑relation API
    findRelation(person1, person2, maxDepth = 20) {
        const { closest } = this.findAllRelations(person1, person2, maxDepth);
        if (!closest) {
            return {
                Relation: "Unrelated",
                RelationString: `${person1.name} and ${person2.name} are not related (within search depth)`,
                CommonAncestor: null,
                GenerationsBack: null
            };
        }
        return {
            Relation: closest.type,
            RelationString: closest.relationString,
            CommonAncestor: closest.commonAncestor,
            GenerationsBack: closest.distance
        };
    }
}

module.exports = { Person };
