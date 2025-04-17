import Foundation
import CoreLocation

class KMLParser: NSObject, XMLParserDelegate {
    private var polygons: [[CLLocationCoordinate2D]] = []
    private var currentCoordinates: [CLLocationCoordinate2D] = []
    private var currentElement = ""

    func parseKML(path: String) -> [[CLLocationCoordinate2D]] {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else {
            print("Failed to load KML file.")
            return []
        }
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
        return polygons
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?,
                attributes attributeDict: [String : String] = [:]) {
        currentElement = elementName
        if elementName == "coordinates" {
            currentCoordinates = []
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if currentElement == "coordinates" {
            let coords = string.trimmingCharacters(in: .whitespacesAndNewlines)
                .components(separatedBy: " ")
            for coord in coords {
                let parts = coord.components(separatedBy: ",")
                if parts.count >= 2,
                   let lon = Double(parts[0]),
                   let lat = Double(parts[1]) {
                    let location = CLLocationCoordinate2D(latitude: lat, longitude: lon)
                    currentCoordinates.append(location)
                }
            }
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?) {
        if elementName == "coordinates" {
            polygons.append(currentCoordinates)
        }
    }
}
