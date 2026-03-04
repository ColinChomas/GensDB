-- Active: 1738367103963@@127.0.0.1@3306@gensdb
CREATE TABLE person_relation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    person1_id INT NOT NULL,
    person2_id INT NOT NULL,
    relation_type VARCHAR(50),
    relation_string VARCHAR(255),
    common_ancestor_id INT NULL,
    distance INT NOT NULL,
    FOREIGN KEY (person1_id) REFERENCES person(id),
    FOREIGN KEY (person2_id) REFERENCES person(id),
    FOREIGN KEY (common_ancestor_id) REFERENCES person(id)
);