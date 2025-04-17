import UIKit
import SceneKit
import ARKit
import CoreLocation

class ViewController: UIViewController, ARSCNViewDelegate, CLLocationManagerDelegate {

    @IBOutlet weak var sceneView: ARSCNView!

    let locationManager = CLLocationManager()
    var currentLocation: CLLocation?
    var currentDirection: CLLocationDirection?

    override func viewDidLoad() {
        super.viewDidLoad()
        sceneView.delegate = self
        sceneView.automaticallyUpdatesLighting = true

        locationManager.delegate = self
        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()
        locationManager.startUpdatingHeading()

        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravityAndHeading
        sceneView.session.run(configuration)

        // Load bundled example KML
        if let path = Bundle.main.path(forResource: "thermi", ofType: "kml") {
            let polygons = KMLParser().parseKML(path: path)
            renderPolygons(polygons)
        }
    }

    func renderPolygons(_ polygons: [[CLLocationCoordinate2D]]) {
        for polygon in polygons {
            for i in 0..<polygon.count - 1 {
                let start = polygon[i]
                let end = polygon[i + 1]
                let startVec = coordinateToSCNVector(start)
                let endVec = coordinateToSCNVector(end)
                let node = lineNode(from: startVec, to: endVec)
                sceneView.scene.rootNode.addChildNode(node)
            }
        }
    }

    func coordinateToSCNVector(_ coord: CLLocationCoordinate2D) -> SCNVector3 {
        return SCNVector3(coord.latitude, 0, coord.longitude)
    }

    func lineNode(from start: SCNVector3, to end: SCNVector3) -> SCNNode {
        let source = SCNGeometrySource(vertices: [start, end])
        let indices: [Int32] = [0, 1]
        let element = SCNGeometryElement(indices: indices, primitiveType: .line)
        let geometry = SCNGeometry(sources: [source], elements: [element])
        geometry.firstMaterial?.diffuse.contents = UIColor.red
        return SCNNode(geometry: geometry)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        currentLocation = locations.last
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        currentDirection = newHeading.trueHeading
    }
}
