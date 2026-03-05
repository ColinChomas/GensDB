CREATE IF NOT EXISTS DATABASE gensDB;

USE gensDB;

CREATE TABLE house (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gens_name VARCHAR(100) NOT NULL,
    founder_id INT NULL
);

CREATE TABLE person (
    id INT AUTO_INCREMENT PRIMARY KEY,
    praenomen VARCHAR(100) NOT NULL,
    nomen VARCHAR(100) NOT NULL,
    cognomen VARCHAR(100),
    house_id INT NOT NULL,
    sex TINYINT(1) NOT NULL,
    is_bastard TINYINT(1) NOT NULL DEFAULT 0,
    birth_year INT,
    death_year INT,
    CONSTRAINT fk_person_house
        FOREIGN KEY (house_id) REFERENCES house(id)
        ON DELETE RESTRICT
);

CREATE TABLE parent_child (
    parent_id INT NOT NULL,
    child_id INT NOT NULL,
    relationship_type ENUM('biological','adoptive','step') NOT NULL DEFAULT 'biological',
    PRIMARY KEY (parent_id, child_id),
    CONSTRAINT fk_pc_parent
        FOREIGN KEY (parent_id) REFERENCES person(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pc_child
        FOREIGN KEY (child_id) REFERENCES person(id)
        ON DELETE CASCADE
);

ALTER TABLE house
ADD CONSTRAINT fk_house_founder
    FOREIGN KEY (founder_id) REFERENCES person(id)
    ON DELETE SET NULL;

